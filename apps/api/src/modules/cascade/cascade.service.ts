import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type CascadeSetting } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { CurrenciesService } from '../currencies/currencies.service';
import {
  CascadeRedisStateService,
  type CascadeCurrencyPayload,
  type CascadeStoredSnapshot,
  type CascadeReqSnapshotRow,
  type CoverageNominalRow,
} from './cascade-redis-state.service';
import {
  approximateOthersEffectiveRange,
  computeForkAssignBounds,
  isForkAutolimitActive,
  nominalCoveredByRange,
  requisiteRating,
  type TraderCascadeMethod,
} from '@p2p/shared';

export interface CascadeResult {
  traderId: string;
  requisiteId: string;
  score: number;
  /** Distributed Redis lock held — release via CascadeRedisStateService after DB commit */
  redisLockHeld?: boolean;
}

/** Alias for cascade ranking rows (materialized mirror in Redis per spec §5–6). */
type ReqSnapshot = CascadeReqSnapshotRow;

function stripRedisMeta(s: CascadeStoredSnapshot): ReqSnapshot {
  const { redis_meta: _rm, ...rest } = s;
  return rest;
}

@Injectable()
export class CascadeService {
  private readonly logger = new Logger(CascadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisState: CascadeRedisStateService,
    private readonly currencies: CurrenciesService,
  ) {}

  async getSettings(): Promise<CascadeSetting> {
    const row = await this.prisma.cascadeSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) {
      throw new Error('cascade_settings row missing (migration seed expected)');
    }
    return row;
  }

  /**
   * Coverage table: how many active requisites can accept each nominal amount (Card + Fork).
   * Served from unified Redis payload when fresh (spec §5.5).
   */
  async getCoverageByNominals(currency: string): Promise<CoverageNominalRow[]> {
    const cur = currency.trim().toUpperCase();
    const unified = await this.redisState.getPayload(cur);
    if (unified) return unified.nominals;
    const payload = await this.buildCurrencyPayload(this.prisma, cur);
    await this.redisState.setPayload(cur, payload);
    return payload.nominals;
  }

  /** Always recomputes nominal coverage from DB (shared builder with Redis materialization). */
  async computeCoverageFromDb(currency: string): Promise<CoverageNominalRow[]> {
    const payload = await this.buildCurrencyPayload(this.prisma, currency.trim().toUpperCase());
    return payload.nominals;
  }

  private snapshotSignature(
    rows: Array<{ id: string; usedAmount: number; usedOps: number }>,
  ): string {
    return [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => `${r.id}:${r.usedAmount}:${r.usedOps}`)
      .join('|');
  }

  private normalizeAssignmentRows(
    raw: Array<{
      id: string;
      traderId: string;
      processingMethod: string;
      usedAmount: Prisma.Decimal;
      limitTotalAmount: Prisma.Decimal;
      usedOps: number;
      limitTotalOps: number;
      minAmount: Prisma.Decimal;
      maxAmount: Prisma.Decimal;
      payinRate: Prisma.Decimal;
    }>,
  ): ReqSnapshot[] {
    return raw.map((r) => ({
      id: r.id,
      traderId: r.traderId,
      processingMethod: r.processingMethod,
      usedAmount: Number(r.usedAmount),
      limitTotalAmount: Number(r.limitTotalAmount),
      usedOps: r.usedOps,
      limitTotalOps: r.limitTotalOps,
      minAmount: Number(r.minAmount),
      maxAmount: Number(r.maxAmount),
      payinRate: Number(r.payinRate),
    }));
  }

  /**
   * Single materialized snapshot for a currency: nominal coverage + active requisite rows +
   * Fork autolimit-derived fields stored alongside rows in Redis (spec §4.4, §5.5).
   */
  async buildCurrencyPayload(
    db: PrismaService | Prisma.TransactionClient,
    currency: string,
  ): Promise<CascadeCurrencyPayload> {
    const settings = await db.cascadeSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!settings) {
      throw new Error('cascade_settings row missing');
    }

    const nominalRows = await db.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));

    const rawRows = await db.$queryRaw<
      Array<{
        id: string;
        traderId: string;
        processingMethod: string;
        usedAmount: Prisma.Decimal;
        limitTotalAmount: Prisma.Decimal;
        usedOps: number;
        limitTotalOps: number;
        minAmount: Prisma.Decimal;
        maxAmount: Prisma.Decimal;
        payinRate: Prisma.Decimal;
      }>
    >`
      SELECT
        r.id,
        r.trader_id AS "traderId",
        tp.processing_method AS "processingMethod",
        r.used_amount::numeric AS "usedAmount",
        r.limit_total_amount::numeric AS "limitTotalAmount",
        r.used_ops AS "usedOps",
        r.limit_total_ops AS "limitTotalOps",
        r.min_amount::numeric AS "minAmount",
        r.max_amount::numeric AS "maxAmount",
        tp.payin_rate::numeric AS "payinRate"
      FROM requisites r
      INNER JOIN requisite_groups g ON g.id = r.requisite_group_id
        AND g.archived_at IS NULL
        AND g.is_active = true
      INNER JOIN trader_profiles tp ON tp.id = r.trader_id
        AND tp.is_active = true
        AND tp.accepting_orders = true
      INNER JOIN currencies rc ON rc.id = r.currency_id AND rc.code = ${currency}
      WHERE r.is_active = true
        AND r.used_ops < r.limit_total_ops
    `;

    const reqs = this.normalizeAssignmentRows(rawRows);

    const nominals: CoverageNominalRow[] = [];
    for (const n of nominalAmounts) {
      let count = 0;
      for (const row of reqs) {
        const range = approximateOthersEffectiveRange({
          traderMethod: row.processingMethod as TraderCascadeMethod,
          limitTotalAmount: Number(row.limitTotalAmount),
          usedAmount: Number(row.usedAmount),
          limitTotalOps: row.limitTotalOps,
          usedOps: row.usedOps,
          manualMin: Number(row.minAmount),
          manualMax: Number(row.maxAmount),
          autolimitEnabledGlobal: settings.autolimitEnabled,
          autolimitThreshold: Number(settings.autolimitThreshold),
        });
        if (!range) continue;
        if (nominalCoveredByRange(n, range.min, range.max)) {
          count++;
        }
      }
      nominals.push({ nominal: n, count });
    }

    const snapshots: CascadeStoredSnapshot[] = reqs.map((row) => {
      const lim = Number(row.limitTotalAmount);
      const ua = Number(row.usedAmount);
      const fillRatio = lim > 0 ? ua / lim : 0;
      const forkInp = {
        traderMethod: row.processingMethod as TraderCascadeMethod,
        limitTotalAmount: lim,
        usedAmount: ua,
        limitTotalOps: row.limitTotalOps,
        usedOps: row.usedOps,
        manualMin: Number(row.minAmount),
        manualMax: Number(row.maxAmount),
        autolimitEnabledGlobal: settings.autolimitEnabled,
        autolimitThreshold: Number(settings.autolimitThreshold),
      };
      const activ = isForkAutolimitActive(forkInp);
      const remAmt = lim - ua;
      const remTx = row.limitTotalOps - row.usedOps;
      let fork_auto_min_estimate: number | undefined;
      if (activ && remTx > 0) {
        fork_auto_min_estimate = remAmt / remTx;
      }
      return {
        ...row,
        redis_meta: {
          fill_ratio: Math.round(fillRatio * 1e6) / 1e6,
          fork_autolimit_active: activ,
          ...(fork_auto_min_estimate !== undefined
            ? { fork_auto_min_estimate }
            : {}),
        },
      };
    });

    const sig = this.snapshotSignature(
      reqs.map((r) => ({
        id: r.id,
        usedAmount: r.usedAmount,
        usedOps: r.usedOps,
      })),
    );

    return {
      snapshot_row_sig: sig,
      nominal_amounts: nominalAmounts,
      nominals,
      snapshots,
      built_at: new Date().toISOString(),
    };
  }

  private async computeSnapshotSignatureFromTx(
    tx: Prisma.TransactionClient,
    currency: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<
      Array<{ id: string; usedAmount: Prisma.Decimal; usedOps: number }>
    >`
      SELECT
        r.id,
        r.used_amount::numeric AS "usedAmount",
        r.used_ops AS "usedOps"
      FROM requisites r
      INNER JOIN requisite_groups g ON g.id = r.requisite_group_id
        AND g.archived_at IS NULL
        AND g.is_active = true
      INNER JOIN trader_profiles tp ON tp.id = r.trader_id
        AND tp.is_active = true
        AND tp.accepting_orders = true
      INNER JOIN currencies rc ON rc.id = r.currency_id AND rc.code = ${currency}
      WHERE r.is_active = true
        AND r.used_ops < r.limit_total_ops
    `;
    return this.snapshotSignature(
      rows.map((r) => ({
        id: r.id,
        usedAmount: Number(r.usedAmount),
        usedOps: r.usedOps,
      })),
    );
  }

  /**
   * Cascade assignment for Pay-In creation: Level 1 trader deficit, Level 2 fill-ratio ranking,
   * Level 3 Fork autolimits (global settings + coverage holes).
   */
  async lockBestRequisiteForPayIn(
    tx: Prisma.TransactionClient,
    params: {
      amount: number;
      currency: string;
      /** Parser reference rate (local fiat per 1 USDT) when enforcing trader USDT capacity */
      parserRate?: number;
      enforceUsdtCapacity: boolean;
    },
  ): Promise<CascadeResult | null> {
    const cascadeStarted = Date.now();
    let redisLockContentionEvents = 0;

    const settings = await tx.cascadeSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!settings) {
      throw new Error('cascade_settings row missing');
    }

    const nominalRows = await tx.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));

    const cur = params.currency.trim().toUpperCase();

    const txSig = await this.computeSnapshotSignatureFromTx(tx, cur);

    let reqRows: ReqSnapshot[];

    const cachedPayload = await this.redisState.getPayload(cur);
    if (cachedPayload?.snapshot_row_sig === txSig) {
      reqRows = cachedPayload.snapshots.map(stripRedisMeta);
    } else {
      const payload = await this.buildCurrencyPayload(tx, cur);
      await this.redisState.setPayload(cur, payload);
      reqRows = payload.snapshots.map(stripRedisMeta);
    }

    /**
     * Level 1 candidate traders: only IDs present on the materialized requisite snapshot (Redis/DB)
     * with at least one requisite that still has remaining volume for this order amount (spec §2.2 step 1, §6 step 2).
     */
    const eligibleTraderIds = new Set(
      reqRows
        .filter((row) => {
          const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
          return remAmt >= params.amount - 1e-9;
        })
        .map((r) => r.traderId),
    );

    const traderRows =
      eligibleTraderIds.size === 0
        ? []
        : await tx.traderProfile.findMany({
            where: {
              id: { in: [...eligibleTraderIds] },
              isActive: true,
              acceptingOrders: true,
            },
            select: { id: true, trafficPercent: true },
          });

    const sumPct = traderRows.reduce((s, t) => s + Number(t.trafficPercent), 0);
    const targets = new Map<string, number>();
    if (traderRows.length > 0 && sumPct <= 0) {
      const eq = 1 / traderRows.length;
      for (const t of traderRows) targets.set(t.id, eq);
    } else {
      for (const t of traderRows) {
        targets.set(t.id, Number(t.trafficPercent) / sumPct);
      }
    }

    const windowStart = new Date(
      Date.now() - settings.slidingWindowHours * 60 * 60 * 1000,
    );

    /** Sliding-window volume by assigned Pay-In traffic (see `traffic_distribution_logs`), scoped by order currency. */
    const volumeRows = await tx.$queryRaw<Array<{ traderId: string; vol: Prisma.Decimal }>>`
      SELECT tdl.trader_id AS "traderId", COALESCE(SUM(tdl.amount), 0)::decimal AS vol
      FROM traffic_distribution_logs tdl
      INNER JOIN payin_orders po ON po.id = tdl.payin_order_id
      INNER JOIN currencies poc ON poc.id = po.currency_id AND poc.code = ${cur}
      WHERE tdl.created_at >= ${windowStart}
      GROUP BY tdl.trader_id
    `;

    const volMap = new Map<string, number>();
    let totalVol = 0;
    for (const row of volumeRows) {
      const v = Number(row.vol);
      volMap.set(row.traderId, v);
      totalVol += v;
    }

    const deficits: Array<{ traderId: string; deficit: number }> = [];
    for (const t of traderRows) {
      const tgt = targets.get(t.id) ?? 0;
      const v = volMap.get(t.id) ?? 0;
      const actual = totalVol > 0 ? v / totalVol : 0;
      deficits.push({ traderId: t.id, deficit: tgt - actual });
    }
    deficits.sort((a, b) => {
      const d = b.deficit - a.deficit;
      if (Math.abs(d) > 1e-12) return d;
      return a.traderId.localeCompare(b.traderId);
    });

    const usdtId = await this.currencies.getUsdtCurrencyId();
    const balanceRows = await tx.traderBalance.findMany({
      where: { currencyId: usdtId },
      select: { traderId: true, amount: true },
    });
    const usdtBal = new Map<string, number>();
    const overdraft = new Map<string, number>();
    for (const b of balanceRows) {
      usdtBal.set(b.traderId, Number(b.amount));
    }
    const odRows = await tx.traderProfile.findMany({
      select: { id: true, overdraftLimit: true },
    });
    for (const r of odRows) {
      overdraft.set(r.id, Number(r.overdraftLimit));
    }

    const snapshots = reqRows.filter((row) => {
      const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
      return remAmt >= params.amount - 1e-9;
    });

    const orderedReqIds: Array<{ id: string; score: number }> = [];

    for (const { traderId } of deficits) {
      const mine = snapshots.filter((s) => s.traderId === traderId);
      const ranked = mine
        .map((row) => {
          const coverageCounts = new Map<number, number>();
          for (const n of nominalAmounts) {
            let c = 0;
            for (const other of snapshots) {
              if (other.id === row.id) continue;
              const range = approximateOthersEffectiveRange({
                traderMethod: other.processingMethod as TraderCascadeMethod,
                limitTotalAmount: Number(other.limitTotalAmount),
                usedAmount: Number(other.usedAmount),
                limitTotalOps: other.limitTotalOps,
                usedOps: other.usedOps,
                manualMin: Number(other.minAmount),
                manualMax: Number(other.maxAmount),
                autolimitEnabledGlobal: settings.autolimitEnabled,
                autolimitThreshold: Number(settings.autolimitThreshold),
              });
              if (!range) continue;
              if (nominalCoveredByRange(n, range.min, range.max)) c++;
            }
            coverageCounts.set(n, c);
          }

          const forkInp = {
            traderMethod: row.processingMethod as TraderCascadeMethod,
            limitTotalAmount: Number(row.limitTotalAmount),
            usedAmount: Number(row.usedAmount),
            limitTotalOps: row.limitTotalOps,
            usedOps: row.usedOps,
            manualMin: Number(row.minAmount),
            manualMax: Number(row.maxAmount),
            autolimitEnabledGlobal: settings.autolimitEnabled,
            autolimitThreshold: Number(settings.autolimitThreshold),
          };

          const bounds = computeForkAssignBounds(
            forkInp,
            nominalAmounts,
            (nominal) => coverageCounts.get(nominal) ?? 0,
          );
          if (!bounds) return null;
          if (
            params.amount < bounds.effMin - 1e-9 ||
            params.amount > bounds.effMax + 1e-9
          ) {
            return null;
          }

          if (params.enforceUsdtCapacity && params.parserRate !== undefined) {
            const cap =
              (usdtBal.get(row.traderId) ?? 0) + (overdraft.get(row.traderId) ?? 0);
            const need =
              params.amount /
              (params.parserRate * (1 + Number(row.payinRate)));
            if (need > cap + 1e-9) return null;
          }

          const w =
            row.processingMethod === 'FORK'
              ? settings.forkRatingWeight
              : settings.cardRatingWeight;
          const score = requisiteRating(
            Number(row.usedAmount),
            Number(row.limitTotalAmount),
            w,
          );
          return { id: row.id, score, tie: Math.random() };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score || a.tie - b.tie);

      for (const r of ranked) {
        orderedReqIds.push({ id: r.id, score: r.score });
      }
    }

    for (const { id, score } of orderedReqIds) {
      const redisOk = await this.redisState.tryAcquireRequisiteLock(id);
      if (!redisOk) {
        redisLockContentionEvents += 1;
        this.logger.log({
          msg: 'cascade.redis_lock_contended',
          event: 'cascade_redis_lock_contended',
          requisite_id: id,
          currency: cur,
          amount: params.amount,
        });
        continue;
      }

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM requisites
        WHERE id = ${id}::uuid
        FOR UPDATE SKIP LOCKED
      `;

      if (locked.length !== 1) {
        await this.redisState.releaseRequisiteLock(id);
        continue;
      }

      const row = snapshots.find((s) => s.id === id);
      if (!row) {
        await this.redisState.releaseRequisiteLock(id);
        continue;
      }

      const duration_ms = Date.now() - cascadeStarted;
      this.logger.log({
        msg: 'cascade.assign_complete',
        event: 'cascade_assign_duration_ms',
        duration_ms,
        currency: cur,
        amount: params.amount,
        outcome: 'assigned',
        requisite_id: id,
        trader_id: row.traderId,
        score,
        redis_lock_contention_events: redisLockContentionEvents,
      });
      return {
        requisiteId: id,
        traderId: row.traderId,
        score,
        redisLockHeld: true,
      };
    }

    const duration_ms = Date.now() - cascadeStarted;
    this.logger.log({
      msg: 'cascade.assign_exhausted',
      event: 'cascade_assign_duration_ms',
      duration_ms,
      currency: cur,
      amount: params.amount,
      outcome: 'no_match',
      redis_lock_contention_events: redisLockContentionEvents,
      candidates_tried: orderedReqIds.length,
    });
    this.logger.warn(
      `No suitable requisite for ${params.amount} ${params.currency} after cascade`,
    );
    return null;
  }

  /**
   * Pay-In assignment bounds shown in the trader cabinet (manual limits vs cascade Fork autolimits).
   */
  async getEffectiveAssignRangesForTrader(traderId: string): Promise<{
    requisites: Array<{
      requisite_id: string;
      currency: string;
      manual_min: number;
      manual_max: number;
      eff_min: number | null;
      eff_max: number | null;
      fork_autolimit_active: boolean;
      participates_in_cascade: boolean;
    }>;
  }> {
    const settings = await this.getSettings();
    const nominalRows = await this.prisma.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));

    const traderReqs = await this.prisma.requisite.findMany({
      where: {
        traderId,
        group: { archivedAt: null },
      },
      include: { currency: { select: { code: true } } },
    });

    const traderProfile = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      select: { processingMethod: true },
    });
    const fallbackMethod = (traderProfile?.processingMethod ?? 'CARD') as TraderCascadeMethod;

    const currencies = [...new Set(traderReqs.map((r) => r.currency.code))];
    const snapshotsByCurrency = new Map<string, ReqSnapshot[]>();

    for (const currency of currencies) {
      const snaps = await this.prisma.$queryRaw<ReqSnapshot[]>`
        SELECT
          r.id,
          r.trader_id AS "traderId",
          tp.processing_method AS "processingMethod",
          r.used_amount::numeric AS "usedAmount",
          r.limit_total_amount::numeric AS "limitTotalAmount",
          r.used_ops AS "usedOps",
          r.limit_total_ops AS "limitTotalOps",
          r.min_amount::numeric AS "minAmount",
          r.max_amount::numeric AS "maxAmount",
          tp.payin_rate::numeric AS "payinRate"
        FROM requisites r
        INNER JOIN requisite_groups g ON g.id = r.requisite_group_id
          AND g.archived_at IS NULL
          AND g.is_active = true
        INNER JOIN trader_profiles tp ON tp.id = r.trader_id
          AND tp.is_active = true
          AND tp.accepting_orders = true
        INNER JOIN currencies rc ON rc.id = r.currency_id AND rc.code = ${currency}
        WHERE r.is_active = true
          AND r.used_ops < r.limit_total_ops
      `;
      snapshotsByCurrency.set(currency, snaps);
    }

    const requisites: Array<{
      requisite_id: string;
      currency: string;
      manual_min: number;
      manual_max: number;
      eff_min: number | null;
      eff_max: number | null;
      fork_autolimit_active: boolean;
      participates_in_cascade: boolean;
    }> = [];

    for (const req of traderReqs) {
      const manualMin = Number(req.minAmount);
      const manualMax = Number(req.maxAmount);
      const snaps = snapshotsByCurrency.get(req.currency.code) ?? [];
      const row = snaps.find((s) => s.id === req.id);

      if (!row) {
        const forkInp = {
          traderMethod: fallbackMethod,
          limitTotalAmount: Number(req.limitTotalAmount),
          usedAmount: Number(req.usedAmount),
          limitTotalOps: req.limitTotalOps,
          usedOps: req.usedOps,
          manualMin,
          manualMax,
          autolimitEnabledGlobal: settings.autolimitEnabled,
          autolimitThreshold: Number(settings.autolimitThreshold),
        };
        requisites.push({
          requisite_id: req.id,
          currency: req.currency.code,
          manual_min: manualMin,
          manual_max: manualMax,
          eff_min: null,
          eff_max: null,
          fork_autolimit_active: isForkAutolimitActive(forkInp),
          participates_in_cascade: false,
        });
        continue;
      }

      const coverageCounts = new Map<number, number>();
      for (const n of nominalAmounts) {
        let c = 0;
        for (const other of snaps) {
          if (other.id === row.id) continue;
          const range = approximateOthersEffectiveRange({
            traderMethod: other.processingMethod as TraderCascadeMethod,
            limitTotalAmount: Number(other.limitTotalAmount),
            usedAmount: Number(other.usedAmount),
            limitTotalOps: other.limitTotalOps,
            usedOps: other.usedOps,
            manualMin: Number(other.minAmount),
            manualMax: Number(other.maxAmount),
            autolimitEnabledGlobal: settings.autolimitEnabled,
            autolimitThreshold: Number(settings.autolimitThreshold),
          });
          if (!range) continue;
          if (nominalCoveredByRange(n, range.min, range.max)) c++;
        }
        coverageCounts.set(n, c);
      }

      const forkInp = {
        traderMethod: row.processingMethod as TraderCascadeMethod,
        limitTotalAmount: Number(row.limitTotalAmount),
        usedAmount: Number(row.usedAmount),
        limitTotalOps: row.limitTotalOps,
        usedOps: row.usedOps,
        manualMin,
        manualMax,
        autolimitEnabledGlobal: settings.autolimitEnabled,
        autolimitThreshold: Number(settings.autolimitThreshold),
      };

      const bounds = computeForkAssignBounds(
        forkInp,
        nominalAmounts,
        (nominal) => coverageCounts.get(nominal) ?? 0,
      );

      requisites.push({
        requisite_id: req.id,
        currency: req.currency.code,
        manual_min: manualMin,
        manual_max: manualMax,
        eff_min: bounds ? bounds.effMin : null,
        eff_max: bounds ? bounds.effMax : null,
        fork_autolimit_active: isForkAutolimitActive(forkInp),
        participates_in_cascade: bounds !== null,
      });
    }

    return { requisites };
  }

  async updateSettings(
    data: {
      slidingWindowHours?: number;
      autolimitThreshold?: number;
      autolimitEnabled?: boolean;
      cardRatingWeight?: number;
      forkRatingWeight?: number;
    },
    updatedById: string,
  ) {
    const row = await this.getSettings();
    return this.prisma.cascadeSetting.update({
      where: { id: row.id },
      data: {
        ...(data.slidingWindowHours !== undefined
          ? { slidingWindowHours: data.slidingWindowHours }
          : {}),
        ...(data.autolimitThreshold !== undefined
          ? { autolimitThreshold: new Prisma.Decimal(data.autolimitThreshold) }
          : {}),
        ...(data.autolimitEnabled !== undefined
          ? { autolimitEnabled: data.autolimitEnabled }
          : {}),
        ...(data.cardRatingWeight !== undefined
          ? { cardRatingWeight: data.cardRatingWeight }
          : {}),
        ...(data.forkRatingWeight !== undefined
          ? { forkRatingWeight: data.forkRatingWeight }
          : {}),
        updatedById,
      },
    });
  }

  async getDistributionStats() {
    const stats = await this.prisma.$queryRaw<
      Array<{
        traderId: string;
        email: string;
        activeRequisites: number;
        todayOrders: number;
        successRate: number;
      }>
    >`
      SELECT
        tp.id AS "traderId",
        u.email,
        COUNT(DISTINCT r.id) FILTER (WHERE r.is_active = true) AS "activeRequisites",
        COUNT(po.id) FILTER (WHERE po.created_at > CURRENT_DATE) AS "todayOrders",
        ROUND(
          COUNT(po.id) FILTER (WHERE po.status = 'PAID' AND po.created_at > NOW() - INTERVAL '7 days') * 100.0 /
          NULLIF(COUNT(po.id) FILTER (WHERE po.created_at > NOW() - INTERVAL '7 days'), 0),
          1
        ) AS "successRate"
      FROM trader_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN requisites r ON r.trader_id = tp.id
      LEFT JOIN payin_orders po ON po.trader_id = tp.id
      WHERE tp.is_active = true
      GROUP BY tp.id, u.email
      ORDER BY "successRate" DESC NULLS LAST
    `;

    return stats;
  }
}

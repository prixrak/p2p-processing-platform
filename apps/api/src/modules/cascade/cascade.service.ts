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
  type CascadeReqRedisMeta,
} from './cascade-redis-state.service';
import {
  approximateOthersEffectiveRange,
  computeForkAssignBounds,
  computeForkAutolimitAutoMaxAmount,
  fillRatioAmount,
  fillRatioTx,
  forkAutolimitAutoMinPerTx,
  isForkAutolimitActive,
  nominalCoveredByRange,
  requisiteRating,
  tzRequisiteRatingPercent,
  type TraderCascadeMethod,
} from '@p2p/shared';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';

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
    private readonly exchangeRate: ExchangeRateService,
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
   * Level 3 checks for a single requisite snapshot (same rules as assignment, score on success).
   */
  private evaluateSnapshotForPayInAmount(
    row: ReqSnapshot,
    amount: number,
    snapshots: ReqSnapshot[],
    nominalAmounts: number[],
    settings: CascadeSetting,
    usdtBal: Map<string, number>,
    overdraft: Map<string, number>,
    parserRate: number | undefined,
    enforceUsdtCapacity: boolean,
  ): { ok: true; score: number } | { ok: false; code: string; detail: string } {
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
    if (!bounds) {
      return {
        ok: false,
        code: 'EFFECTIVE_BOUNDS_UNAVAILABLE',
        detail:
          'Fork/card bounds could not be derived (limits exhausted or incompatible with coverage grid).',
      };
    }
    if (amount < bounds.effMin - 1e-9 || amount > bounds.effMax + 1e-9) {
      return {
        ok: false,
        code: 'AMOUNT_OUTSIDE_EFFECTIVE_RANGE',
        detail: `Amount ${amount} not in [${bounds.effMin.toFixed(2)}, ${bounds.effMax.toFixed(2)}].`,
      };
    }

    if (enforceUsdtCapacity && parserRate !== undefined) {
      const cap =
        (usdtBal.get(row.traderId) ?? 0) + (overdraft.get(row.traderId) ?? 0);
      const need =
        amount / (parserRate * (1 + Number(row.payinRate)));
      if (need > cap + 1e-9) {
        return {
          ok: false,
          code: 'USDT_CAPACITY_INSUFFICIENT',
          detail: `Required ≈${need.toFixed(4)} USDT (with pay-in rate) exceeds trader capacity ${cap.toFixed(4)} USDT (incl. overdraft).`,
        };
      }
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
    return { ok: true, score };
  }

  private async getUsdtCapacityMaps(
    db: PrismaService | Prisma.TransactionClient,
  ): Promise<{
    usdtBal: Map<string, number>;
    overdraft: Map<string, number>;
  }> {
    const usdtId = await this.currencies.getUsdtCurrencyId();
    const balanceRows = await db.traderBalance.findMany({
      where: { currencyId: usdtId },
      select: { traderId: true, amount: true },
    });
    const usdtBal = new Map<string, number>();
    const overdraft = new Map<string, number>();
    for (const b of balanceRows) {
      usdtBal.set(b.traderId, Number(b.amount));
    }
    const odRows = await db.traderProfile.findMany({
      select: { id: true, overdraftLimit: true },
    });
    for (const r of odRows) {
      overdraft.set(r.id, Number(r.overdraftLimit));
    }
    return { usdtBal, overdraft };
  }

  /**
   * Levels 1–3 ordering for a hypothetical Pay-In amount (same ordering as assignment; no Redis locks).
   */
  private async buildOrderedRequisiteIdsForAmount(
    db: PrismaService | Prisma.TransactionClient,
    args: {
      currency: string;
      amount: number;
      parserRate?: number;
      enforceUsdtCapacity: boolean;
      settings: CascadeSetting;
      nominalAmounts: number[];
      reqRows: ReqSnapshot[];
    },
  ): Promise<Array<{ id: string; score: number; traderId: string }>> {
    const {
      currency,
      amount,
      parserRate,
      enforceUsdtCapacity,
      settings,
      nominalAmounts,
      reqRows,
    } = args;
    const cur = currency.trim().toUpperCase();

    const eligibleTraderIds = new Set(
      reqRows
        .filter((row) => {
          const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
          return remAmt >= amount - 1e-9;
        })
        .map((r) => r.traderId),
    );

    const traderRows =
      eligibleTraderIds.size === 0
        ? []
        : await db.traderProfile.findMany({
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

    const volumeRows = await db.$queryRaw<Array<{ traderId: string; vol: Prisma.Decimal }>>`
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

    const { usdtBal, overdraft } = await this.getUsdtCapacityMaps(db);

    const snapshots = reqRows.filter((row) => {
      const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
      return remAmt >= amount - 1e-9;
    });

    const orderedReqIds: Array<{ id: string; score: number; traderId: string }> = [];

    for (const { traderId } of deficits) {
      const mine = snapshots.filter((s) => s.traderId === traderId);
      const ranked = mine
        .map((row) => {
          const ev = this.evaluateSnapshotForPayInAmount(
            row,
            amount,
            snapshots,
            nominalAmounts,
            settings,
            usdtBal,
            overdraft,
            parserRate,
            enforceUsdtCapacity,
          );
          if (!ev.ok) return null;
          return {
            id: row.id,
            score: ev.score,
            tie: Math.random(),
            traderId: row.traderId,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score || a.tie - b.tie);

      for (const r of ranked) {
        orderedReqIds.push({
          id: r.id,
          score: r.score,
          traderId: r.traderId,
        });
      }
    }

    return orderedReqIds;
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

    const cur = currency.trim().toUpperCase();

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
      INNER JOIN users u ON u.id = tp.user_id
        AND u.is_active = true
      INNER JOIN currencies rc ON rc.id = r.currency_id AND rc.code = ${cur}
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

    for (const row of nominals) {
      if (row.count === 0) {
        this.logger.warn({
          msg: 'cascade.nominal_coverage_zero',
          event: 'nominal_coverage_zero',
          currency: cur,
          nominal: row.nominal,
        });
      }
    }

    const previewAmount =
      nominalAmounts.length > 0 ? Math.min(...nominalAmounts) : 100;

    let parserRate: number | undefined;
    if (cur === 'UAH') {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
      } catch {
        parserRate = undefined;
      }
    }

    const enforceUsdt = cur === 'UAH' && parserRate !== undefined;

    const previewOrder = await this.buildOrderedRequisiteIdsForAmount(db, {
      currency: cur,
      amount: previewAmount,
      parserRate,
      enforceUsdtCapacity: enforceUsdt,
      settings,
      nominalAmounts,
      reqRows: reqs,
    });

    const rankById = new Map<string, number>();
    for (let i = 0; i < previewOrder.length; i++) {
      rankById.set(previewOrder[i]!.id, i + 1);
    }
    const eligiblePreview = new Set(previewOrder.map((x) => x.id));

    const snapshots: CascadeStoredSnapshot[] = reqs.map((row) => {
      const lim = Number(row.limitTotalAmount);
      const ua = Number(row.usedAmount);
      const fr = fillRatioAmount(ua, lim);
      const frTx = fillRatioTx(row.usedOps, row.limitTotalOps);
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

      const coverageCounts = new Map<number, number>();
      for (const n of nominalAmounts) {
        let c = 0;
        for (const other of reqs) {
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

      const bounds = computeForkAssignBounds(
        forkInp,
        nominalAmounts,
        (nominal) => coverageCounts.get(nominal) ?? 0,
      );

      const w =
        row.processingMethod === 'FORK'
          ? settings.forkRatingWeight
          : settings.cardRatingWeight;
      const weighted = requisiteRating(ua, lim, w);

      let autoMaxNominal: number | undefined = computeForkAutolimitAutoMaxAmount(
        forkInp,
        nominalAmounts,
        (nominal) => coverageCounts.get(nominal) ?? 0,
      );
      if (autoMaxNominal !== undefined) {
        autoMaxNominal = Math.min(autoMaxNominal, remAmt);
      }

      const forkMinEst = forkAutolimitAutoMinPerTx(forkInp);
      const fork_auto_min_estimate =
        forkMinEst !== undefined ? forkMinEst : activ && remTx > 0 ? remAmt / remTx : undefined;

      const redis_meta: CascadeReqRedisMeta = {
        fill_ratio: Math.round(fr * 1e6) / 1e6,
        fill_ratio_tx: Math.round(frTx * 1e6) / 1e6,
        rating: tzRequisiteRatingPercent(fr),
        remaining_amount: Math.round(remAmt * 1e4) / 1e4,
        remaining_transactions: remTx,
        effective_min: bounds ? bounds.effMin : null,
        effective_max: bounds ? bounds.effMax : null,
        fork_autolimit_active: activ,
        weighted_score: Math.round(weighted * 1e6) / 1e6,
        is_eligible_preview: eligiblePreview.has(row.id),
        cascade_rank: rankById.get(row.id) ?? null,
        ...(fork_auto_min_estimate !== undefined
          ? { fork_auto_min_estimate: Math.round(fork_auto_min_estimate * 1e4) / 1e4 }
          : {}),
        ...(autoMaxNominal !== undefined ? { auto_max_amount: autoMaxNominal } : {}),
      };

      if (fr > 0.8) {
        this.logger.log({
          msg: 'cascade.requisite_fill_ratio_high',
          event: 'requisite_fill_ratio_high',
          currency: cur,
          requisite_id: row.id,
          fill_ratio: fr,
        });
      }

      return {
        ...row,
        redis_meta,
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
      payload_version: 3,
      snapshot_row_sig: sig,
      nominal_amounts: nominalAmounts,
      nominals,
      snapshots,
      built_at: new Date().toISOString(),
      preview_amount: previewAmount,
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
      INNER JOIN users u ON u.id = tp.user_id
        AND u.is_active = true
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
    if (
      cachedPayload?.snapshot_row_sig === txSig &&
      cachedPayload.payload_version === 3
    ) {
      reqRows = cachedPayload.snapshots.map(stripRedisMeta);
    } else {
      const payload = await this.buildCurrencyPayload(tx, cur);
      await this.redisState.setPayload(cur, payload);
      reqRows = payload.snapshots.map(stripRedisMeta);
    }

    const orderedReqIds = await this.buildOrderedRequisiteIdsForAmount(tx, {
      currency: cur,
      amount: params.amount,
      parserRate: params.parserRate,
      enforceUsdtCapacity: params.enforceUsdtCapacity,
      settings,
      nominalAmounts,
      reqRows,
    });

    const snapshots = reqRows.filter((row) => {
      const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
      return remAmt >= params.amount - 1e-9;
    });

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
        INNER JOIN users u ON u.id = tp.user_id
          AND u.is_active = true
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

  /**
   * Staff: requisite cascade observability rows for the rating table (TZ).
   */
  async listRequisiteRatingsForStaff(options: {
    currency: string;
    preview_amount?: number;
    trader_id?: string;
    method?: 'CARD' | 'FORK' | 'ALL';
    status_filter?: 'all' | 'active' | 'locked' | 'ineligible' | 'disabled';
    autolimit_filter?: 'all' | 'on' | 'off';
    q?: string;
    sort?: 'rating' | 'trader' | 'remainder' | 'status' | 'rank';
    sort_dir?: 'asc' | 'desc';
  }): Promise<{
    currency: string;
    preview_amount: number;
    rows: Array<Record<string, unknown>>;
  }> {
    const cur = options.currency.trim().toUpperCase();
    const settings = await this.getSettings();
    const nominalRows = await this.prisma.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));
    const defaultPreview = nominalAmounts.length > 0 ? Math.min(...nominalAmounts) : 100;
    const previewAmount = options.preview_amount ?? defaultPreview;

    let parserRate: number | undefined;
    if (cur === 'UAH') {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
      } catch {
        parserRate = undefined;
      }
    }
    const enforceUsdt = cur === 'UAH' && parserRate !== undefined;

    let payload = await this.redisState.getPayload(cur);
    if (!payload || payload.payload_version !== 3) {
      payload = await this.buildCurrencyPayload(this.prisma, cur);
      await this.redisState.setPayload(cur, payload);
    }

    const strip = (s: CascadeStoredSnapshot): ReqSnapshot => {
      const { redis_meta: _rm, ...rest } = s;
      return rest;
    };

    let rankById = new Map<string, number>();
    let eligiblePreview = new Set<string>();
    if (Math.abs(previewAmount - payload.preview_amount) < 1e-9) {
      for (const s of payload.snapshots) {
        const rk = s.redis_meta?.cascade_rank;
        if (rk != null) rankById.set(s.id, rk);
        if (s.redis_meta?.is_eligible_preview) eligiblePreview.add(s.id);
      }
    } else {
      const ordered = await this.buildOrderedRequisiteIdsForAmount(this.prisma, {
        currency: cur,
        amount: previewAmount,
        parserRate,
        enforceUsdtCapacity: enforceUsdt,
        settings,
        nominalAmounts,
        reqRows: payload.snapshots.map(strip),
      });
      for (let i = 0; i < ordered.length; i++) {
        rankById.set(ordered[i]!.id, i + 1);
      }
      eligiblePreview = new Set(ordered.map((o) => o.id));
    }

    const metaById = new Map(
      payload.snapshots.map((s) => [s.id, s.redis_meta]),
    );

    const dbReqs = await this.prisma.requisite.findMany({
      where: { currency: { code: cur } },
      include: {
        trader: {
          select: {
            id: true,
            processingMethod: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    const maskNum = (num: string) => {
      const d = num.replace(/\s/g, '');
      if (d.length <= 4) return '****';
      return `**** ${d.slice(-4)}`;
    };

    type RowOut = {
      requisite_id: string;
      trader_id: string;
      trader_label: string;
      processing_method: string;
      requisite_masked: string;
      is_active: boolean;
      is_in_cascade_pool: boolean;
      fill_ratio: number;
      fill_ratio_tx: number;
      rating: number;
      weighted_score: number;
      used_amount: number;
      limit_total_amount: number;
      used_ops: number;
      limit_total_ops: number;
      remaining_amount: number;
      manual_min_amount: number;
      manual_max_amount: number;
      effective_min: number | null;
      effective_max: number | null;
      autolimit_active: boolean;
      auto_min_amount: number | null;
      auto_max_amount: number | null;
      cascade_rank: number | null;
      is_eligible_preview: boolean;
      is_locked: boolean;
      last_assigned_at: string | null;
      last_assignment_order_id: string | null;
      assignments_count: number;
      composite_status: 'ACTIVE' | 'LOCKED' | 'INELIGIBLE' | 'DISABLED';
      autolimit_badge: boolean;
      fill_high: boolean;
    };

    const ids = dbReqs.map((r) => r.id);
    const [locks, assigns] = await Promise.all([
      this.redisState.areRequisitesLocked(ids),
      this.redisState.getRequisiteAssignmentMetaMany(ids),
    ]);

    const methodF = (options.method ?? 'ALL').toUpperCase();
    const statusF = options.status_filter ?? 'active';

    const rows: RowOut[] = [];

    for (const r of dbReqs) {
      if (options.trader_id && r.traderId !== options.trader_id) continue;
      const pm = r.trader.processingMethod as string;
      if (methodF === 'CARD' && pm !== 'CARD') continue;
      if (methodF === 'FORK' && pm !== 'FORK') continue;

      const meta = metaById.get(r.id);
      const inPool = meta !== undefined;
      const lim = Number(r.limitTotalAmount);
      const ua = Number(r.usedAmount);
      const fr = meta?.fill_ratio ?? fillRatioAmount(ua, lim);
      const frTx = meta?.fill_ratio_tx ?? fillRatioTx(r.usedOps, r.limitTotalOps);
      const rating = meta?.rating ?? tzRequisiteRatingPercent(fr);
      const w =
        pm === 'FORK' ? settings.forkRatingWeight : settings.cardRatingWeight;
      const weighted =
        meta?.weighted_score ?? requisiteRating(ua, lim, w);

      let effMin = meta?.effective_min ?? null;
      let effMax = meta?.effective_max ?? null;
      let autolimitActive = meta?.fork_autolimit_active ?? false;
      let autoMin = meta?.fork_auto_min_estimate ?? null;
      let autoMax = meta?.auto_max_amount ?? null;
      if (!inPool) {
        const forkInp = {
          traderMethod: r.trader.processingMethod as TraderCascadeMethod,
          limitTotalAmount: lim,
          usedAmount: ua,
          limitTotalOps: r.limitTotalOps,
          usedOps: r.usedOps,
          manualMin: Number(r.minAmount),
          manualMax: Number(r.maxAmount),
          autolimitEnabledGlobal: settings.autolimitEnabled,
          autolimitThreshold: Number(settings.autolimitThreshold),
        };
        autolimitActive = isForkAutolimitActive(forkInp);
        autoMin = forkAutolimitAutoMinPerTx(forkInp) ?? null;
        const coverageCounts = new Map<number, number>();
        for (const n of nominalAmounts) {
          let c = 0;
          for (const other of payload.snapshots.map(strip)) {
            if (other.id === r.id) continue;
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
        const bounds = computeForkAssignBounds(
          forkInp,
          nominalAmounts,
          (nominal) => coverageCounts.get(nominal) ?? 0,
        );
        effMin = bounds?.effMin ?? null;
        effMax = bounds?.effMax ?? null;
        const am = computeForkAutolimitAutoMaxAmount(
          forkInp,
          nominalAmounts,
          (nominal) => coverageCounts.get(nominal) ?? 0,
        );
        autoMax = am !== undefined ? Math.min(am, lim - ua) : null;
      }

      const remAmt = meta?.remaining_amount ?? lim - ua;
      const isLocked = locks.get(r.id) ?? false;
      const eligible = inPool
        ? eligiblePreview.has(r.id)
        : false;
      const assign = assigns.get(r.id)!;

      let composite: RowOut['composite_status'] = 'ACTIVE';
      if (!r.isActive) composite = 'DISABLED';
      else if (isLocked) composite = 'LOCKED';
      else if (!eligible) composite = 'INELIGIBLE';

      const autolimitBadge =
        pm === 'FORK' && (meta?.fork_autolimit_active ?? autolimitActive);
      const fillHigh = fr > 0.8;

      if (statusF === 'active' && !(composite === 'ACTIVE')) continue;
      if (statusF === 'locked' && composite !== 'LOCKED') continue;
      if (statusF === 'ineligible' && composite !== 'INELIGIBLE') continue;
      if (statusF === 'disabled' && composite !== 'DISABLED') continue;

      const altF = options.autolimit_filter ?? 'all';
      if (altF === 'on' && !autolimitBadge) continue;
      if (altF === 'off' && autolimitBadge) continue;

      const q = options.q?.trim().toLowerCase();
      if (q) {
        const email = (r.trader.user.email ?? '').toLowerCase();
        const masked = maskNum(r.number).toLowerCase();
        if (!email.includes(q) && !masked.includes(q) && !r.id.toLowerCase().includes(q)) {
          continue;
        }
      }

      rows.push({
        requisite_id: r.id,
        trader_id: r.traderId,
        trader_label: r.trader.user.email ?? r.traderId,
        processing_method: pm,
        requisite_masked: maskNum(r.number),
        is_active: r.isActive,
        is_in_cascade_pool: inPool,
        fill_ratio: fr,
        fill_ratio_tx: frTx,
        rating,
        weighted_score: weighted,
        used_amount: ua,
        limit_total_amount: lim,
        used_ops: r.usedOps,
        limit_total_ops: r.limitTotalOps,
        remaining_amount: remAmt,
        manual_min_amount: Number(r.minAmount),
        manual_max_amount: Number(r.maxAmount),
        effective_min: effMin,
        effective_max: effMax,
        autolimit_active: autolimitBadge,
        auto_min_amount: autoMin,
        auto_max_amount: autoMax,
        cascade_rank: rankById.get(r.id) ?? null,
        is_eligible_preview: eligible,
        is_locked: isLocked,
        last_assigned_at: assign.last_assigned_at,
        last_assignment_order_id: assign.last_assignment_order_id,
        assignments_count: assign.assignments_count,
        composite_status: composite,
        autolimit_badge: !!autolimitBadge,
        fill_high: fillHigh,
      });
    }

    const sort = options.sort ?? 'rating';
    const sort_dir =
      options.sort_dir ??
      (sort === 'rating' || sort === 'remainder' ? 'desc' : 'asc');
    const dir = sort_dir === 'asc' ? 1 : -1;
    const cmpNum = (a: number | null, b: number | null) => {
      const av = a ?? 999999;
      const bv = b ?? 999999;
      return av === bv ? 0 : av < bv ? -1 : 1;
    };
    rows.sort((a, b) => {
      let c = 0;
      if (sort === 'rank') c = cmpNum(a.cascade_rank, b.cascade_rank) * dir;
      else if (sort === 'rating') c = (a.rating - b.rating) * dir;
      else if (sort === 'trader')
        c = a.trader_label.localeCompare(b.trader_label) * dir;
      else if (sort === 'remainder')
        c = (a.remaining_amount - b.remaining_amount) * dir;
      else if (sort === 'status')
        c = a.composite_status.localeCompare(b.composite_status) * dir;
      if (c !== 0) return c;
      return a.requisite_id.localeCompare(b.requisite_id);
    });

    return {
      currency: cur,
      preview_amount: previewAmount,
      rows,
    };
  }

  /** Trader cabinet: simplified observability for own requisites (all currencies). */
  async listRequisiteRatingsForTrader(traderId: string) {
    const settings = await this.getSettings();
    const nominalRows = await this.prisma.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));

    const requisites = await this.prisma.requisite.findMany({
      where: { traderId },
      include: {
        currency: { select: { code: true } },
        trader: { select: { processingMethod: true } },
      },
    });

    const out: Array<{
      requisite_id: string;
      currency: string;
      fill_ratio: number;
      rating: number;
      effective_min: number | null;
      effective_max: number | null;
      composite_status: string;
      autolimit_active: boolean;
    }> = [];

    const byCode = new Map<string, (typeof requisites)[number][]>();
    for (const r of requisites) {
      const code = r.currency.code.toUpperCase();
      const arr = byCode.get(code) ?? [];
      arr.push(r);
      byCode.set(code, arr);
    }

    for (const [code, list] of byCode) {
      let payload = await this.redisState.getPayload(code);
      if (!payload || payload.payload_version !== 3) {
        payload = await this.buildCurrencyPayload(this.prisma, code);
        await this.redisState.setPayload(code, payload);
      }
      const metaById = new Map(
        payload.snapshots.map((s) => [s.id, s.redis_meta]),
      );

      for (const r of list) {
        const meta = metaById.get(r.id);
        const lim = Number(r.limitTotalAmount);
        const ua = Number(r.usedAmount);
        const fr = meta?.fill_ratio ?? fillRatioAmount(ua, lim);
        const inPool = meta !== undefined;
        let effMin = meta?.effective_min ?? null;
        let effMax = meta?.effective_max ?? null;
        let autolimitActive = meta?.fork_autolimit_active ?? false;
        if (!inPool) {
          const forkInp = {
            traderMethod: r.trader.processingMethod as TraderCascadeMethod,
            limitTotalAmount: lim,
            usedAmount: ua,
            limitTotalOps: r.limitTotalOps,
            usedOps: r.usedOps,
            manualMin: Number(r.minAmount),
            manualMax: Number(r.maxAmount),
            autolimitEnabledGlobal: settings.autolimitEnabled,
            autolimitThreshold: Number(settings.autolimitThreshold),
          };
          const coverageCounts = new Map<number, number>();
          for (const n of nominalAmounts) {
            let c = 0;
            for (const other of payload.snapshots) {
              if (other.id === r.id) continue;
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
          const bounds = computeForkAssignBounds(
            forkInp,
            nominalAmounts,
            (nominal) => coverageCounts.get(nominal) ?? 0,
          );
          effMin = bounds?.effMin ?? null;
          effMax = bounds?.effMax ?? null;
          autolimitActive =
            r.trader.processingMethod === 'FORK' && isForkAutolimitActive(forkInp);
        } else {
          autolimitActive =
            r.trader.processingMethod === 'FORK' && (meta?.fork_autolimit_active ?? false);
        }
        const eligible = meta?.is_eligible_preview ?? false;
        let composite: 'ACTIVE' | 'LOCKED' | 'INELIGIBLE' | 'DISABLED' = 'ACTIVE';
        if (!r.isActive) composite = 'DISABLED';
        else if (!eligible) composite = 'INELIGIBLE';

        out.push({
          requisite_id: r.id,
          currency: code,
          fill_ratio: fr,
          rating: meta?.rating ?? tzRequisiteRatingPercent(fr),
          effective_min: effMin,
          effective_max: effMax,
          composite_status: composite,
          autolimit_active: autolimitActive,
        });
      }
    }

    return { rows: out };
  }

  /** Ordered assignment preview for a hypothetical amount (explain cascade path). */
  async explainAssignmentOrder(
    currency: string,
    amount: number,
    options?: { detailed?: boolean },
  ) {
    const cur = currency.trim().toUpperCase();
    const settings = await this.getSettings();
    const nominalRows = await this.prisma.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));
    let parserRate: number | undefined;
    if (cur === 'UAH') {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
      } catch {
        parserRate = undefined;
      }
    }
    const enforceUsdt = cur === 'UAH' && parserRate !== undefined;
    const payload = await this.buildCurrencyPayload(this.prisma, cur);
    const strip = (s: CascadeStoredSnapshot): ReqSnapshot => {
      const { redis_meta: _rm, ...rest } = s;
      return rest;
    };
    const reqRows = payload.snapshots.map(strip);
    const ordered = await this.buildOrderedRequisiteIdsForAmount(this.prisma, {
      currency: cur,
      amount,
      parserRate,
      enforceUsdtCapacity: enforceUsdt,
      settings,
      nominalAmounts,
      reqRows,
    });
    const ranked = ordered.map((o, i) => ({
      rank: i + 1,
      requisite_id: o.id,
      trader_id: o.traderId,
      weighted_score: Math.round(o.score * 1e6) / 1e6,
    }));

    const base = {
      currency: cur,
      amount,
      ranks: ranked,
    };

    if (!options?.detailed) {
      return base;
    }

    const { usdtBal, overdraft } = await this.getUsdtCapacityMaps(this.prisma);
    const snapshots = reqRows.filter((row) => {
      const remAmt = Number(row.limitTotalAmount) - Number(row.usedAmount);
      return remAmt >= amount - 1e-9;
    });
    const orderedIds = new Set(ordered.map((o) => o.id));

    const excluded: Array<{
      requisite_id: string;
      trader_id: string;
      code: string;
      detail: string;
    }> = [];

    for (const row of reqRows) {
      const lim = Number(row.limitTotalAmount);
      const ua = Number(row.usedAmount);
      const remAmt = lim - ua;
      if (remAmt < amount - 1e-9) {
        excluded.push({
          requisite_id: row.id,
          trader_id: row.traderId,
          code: 'INSUFFICIENT_AMOUNT_HEADROOM',
          detail: `Remaining amount ${remAmt.toFixed(2)} is less than order ${amount}.`,
        });
        continue;
      }

      const ev = this.evaluateSnapshotForPayInAmount(
        row,
        amount,
        snapshots,
        nominalAmounts,
        settings,
        usdtBal,
        overdraft,
        parserRate,
        enforceUsdt,
      );
      if (!ev.ok) {
        excluded.push({
          requisite_id: row.id,
          trader_id: row.traderId,
          code: ev.code,
          detail: ev.detail,
        });
      } else if (!orderedIds.has(row.id)) {
        excluded.push({
          requisite_id: row.id,
          trader_id: row.traderId,
          code: 'LOWER_CASCADE_ORDER',
          detail:
            'Passes amount checks but is ranked after higher-priority candidates in traffic-deficit × weighted-score ordering.',
        });
      }
    }

    return { ...base, excluded };
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

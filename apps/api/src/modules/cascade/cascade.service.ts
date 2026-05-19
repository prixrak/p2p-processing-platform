import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  PayinStatus,
  Prisma,
  type CascadeLevelPickMode,
  type CascadeSetting,
} from '@prisma/client';
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
  applyCascadeCreditsAfterAssignment,
  cardCascadeRaceScore,
  cascadeLevelAttemptOrder,
  computeForkAssignBounds,
  payInAssignMax,
  computeForkAutolimitAutoMaxAmount,
  confirmedPayinFillRatio,
  effectiveIdleMs,
  fillMultiplierConfigFingerprint,
  fillMultiplierFromConfirmedFill,
  fillRatioAmount,
  fillRatioTx,
  forkAutolimitAutoMinPerTx,
  forkCascadeRaceScore,
  isForkAutolimitActive,
  MONEY_COMPARE_EPS,
  newcomerRatingBoostMultiplier,
  nominalCoveredByRange,
  normalizeCascadeMethodPercents,
  parseFillMultiplierTiersJson,
  payInAmountWithinAssignRange,
  payInAmountBlockedOnRequisite,
  PAYIN_PRE_USDT_SETTLEMENT_STATUSES,
  PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES,
  pickPrimaryCascadeLevelDebt,
  pickPrimaryCascadeLevelStochastic,
  roundMoney2,
  tzRequisiteRatingPercent,
  computeTraderUsdtCapacity,
  type CascadeAssignmentLevel,
  type FillMultiplierTier,
  type TraderCascadeMethod,
  PayinNoRequisiteReason,
} from '@p2p/shared';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
  PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT,
} from '../platform-settings/platform-settings.service';

export type CascadeTraderAssignment = {
  kind: 'trader';
  traderId: string;
  requisiteId: string;
  score: number;
  /** Fork vs Card pool where this assignment landed (after fallback chain). */
  assignmentLevel: 'FORK' | 'CARD';
  /** Debt/stochastic primary tier for this Pay-In (drives cascade_level_debits). */
  primaryCascadeLevel: CascadeAssignmentLevel;
  landedCascadeLevel: CascadeAssignmentLevel;
  /** Distributed Redis lock held — release via CascadeRedisStateService after DB commit */
  redisLockHeld?: boolean;
};

export type CascadeProviderAssignment = {
  kind: 'provider';
  providerExternalRef: string;
  score: number;
  assignmentLevel: 'PROVIDER';
  primaryCascadeLevel: CascadeAssignmentLevel;
  landedCascadeLevel: 'PROVIDER';
};

export type CascadeResult = CascadeTraderAssignment | CascadeProviderAssignment;

export type CascadeNoMatch = {
  kind: 'none';
  reason: PayinNoRequisiteReason;
  detail?: string;
};

export type CascadePickResult = CascadeResult | CascadeNoMatch;

/** Alias for cascade ranking rows (materialized mirror in Redis per spec §5–6). */
type ReqSnapshot = CascadeReqSnapshotRow;

function stripRedisMeta(s: CascadeStoredSnapshot): ReqSnapshot {
  const { redis_meta: _rm, ...rest } = s;
  return rest;
}

/** PAN/IBAN masking shared between staff observability endpoints. */
function maskRequisiteNumber(num: string): string {
  const d = (num ?? '').replace(/\s/g, '');
  if (d.length <= 4) return '****';
  return `**** ${d.slice(-4)}`;
}

/** Prisma `PayinStatus` values aligned with {@link PAYIN_PRE_USDT_SETTLEMENT_STATUSES}. */
const PAYIN_STATUS_PENDING_USDT_SETTLEMENT: PayinStatus[] =
  PAYIN_PRE_USDT_SETTLEMENT_STATUSES.map((s) => s as unknown as PayinStatus);

/** Prisma `PayinStatus` values aligned with {@link PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES}. */
const PAYIN_STATUS_SAME_AMOUNT_BLOCKING: PayinStatus[] =
  PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES.map((s) => s as unknown as PayinStatus);

@Injectable()
export class CascadeService {
  private readonly logger = new Logger(CascadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisState: CascadeRedisStateService,
    private readonly currencies: CurrenciesService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * Idle ms using PostgreSQL NOW() vs cascade_idle_anchor_at (anchor is set with SQL NOW()).
   * Avoids Node vs Postgres clock skew that can make idle look like 0 for everyone.
   */
  private async fetchRequisiteIdleMsFromDb(
    db: PrismaService | Prisma.TransactionClient,
    requisiteIds: string[],
  ): Promise<Map<string, number>> {
    const unique = [...new Set(requisiteIds)];
    if (unique.length === 0) return new Map();
    const rows = await db.$queryRaw<Array<{ id: string; idle_ms: bigint }>>(
      Prisma.sql`
        SELECT r.id::text AS id,
          GREATEST(
            0,
            FLOOR(
              (EXTRACT(EPOCH FROM (NOW() - r.cascade_idle_anchor_at)) * 1000)
            )::bigint
          ) AS idle_ms
        FROM requisites r
        WHERE r.id IN (${Prisma.join(
          unique.map((id) => Prisma.sql`${id}::uuid`),
        )})
      `,
    );
    return new Map(rows.map((r) => [r.id, Number(r.idle_ms)]));
  }

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
    rows: Array<{
      id: string;
      usedAmount: number;
      usedOps: number;
      cascadeIdleAnchorAt: string;
      payinAssignmentsCount: number;
      cascadeRatingMultiplier: number;
      confirmedPayinAmount: number;
    }>,
  ): string {
    return [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (r) =>
          `${r.id}:${r.usedAmount}:${r.usedOps}:${r.cascadeIdleAnchorAt}:${r.payinAssignmentsCount}:${r.cascadeRatingMultiplier}:${r.confirmedPayinAmount}`,
      )
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
      cascadeIdleAnchorAt: Date;
      payinAssignmentsCount: number;
      cascadeRatingMultiplier: Prisma.Decimal;
      confirmedPayinAmount: Prisma.Decimal;
    }>,
  ): ReqSnapshot[] {
    return raw.map((r) => ({
      id: r.id,
      traderId: r.traderId,
      processingMethod: r.processingMethod,
      usedAmount: Number(r.usedAmount),
      limitTotalAmount: Number(r.limitTotalAmount),
      confirmedPayinAmount: Number(r.confirmedPayinAmount),
      usedOps: r.usedOps,
      limitTotalOps: r.limitTotalOps,
      minAmount: Number(r.minAmount),
      maxAmount: Number(r.maxAmount),
      payinRate: Number(r.payinRate),
      cascadeIdleAnchorAt: r.cascadeIdleAnchorAt.toISOString(),
      payinAssignmentsCount: r.payinAssignmentsCount,
      cascadeRatingMultiplier: Number(r.cascadeRatingMultiplier),
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
    pendingPayinUsdtDebit: Map<string, number>,
    parserRate: number | undefined,
    enforceUsdtCapacity: boolean,
    nowMs: number,
    assignmentTier: 'FORK' | 'CARD',
    fillTiers: readonly FillMultiplierTier[] | null,
    idleMsByRequisiteId?: ReadonlyMap<string, number>,
    tryAnyNominal = false,
    occupiedAmountsOnRequisite: readonly number[] = [],
    occupiedByRequisiteId: ReadonlyMap<string, readonly number[]> = new Map(),
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
        if (!nominalCoveredByRange(n, range.min, range.max)) continue;
        if (payInAmountBlockedOnRequisite(occupiedByRequisiteId.get(other.id) ?? [], n)) {
          continue;
        }
        c++;
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

    const checkAmountForAssign = (
      a: number,
    ): { ok: true } | { ok: false; code: string; detail: string } => {
      const rangeOk = payInAmountWithinAssignRange(
        forkInp,
        nominalAmounts,
        (nominal) => coverageCounts.get(nominal) ?? 0,
        a,
      );
      if (!rangeOk.ok) return rangeOk;

      if (payInAmountBlockedOnRequisite(occupiedAmountsOnRequisite, a)) {
        return {
          ok: false,
          code: 'REQUISITE_SAME_AMOUNT_ACTIVE',
          detail: `Requisite already has an in-flight Pay-In for amount ${roundMoney2(a).toFixed(2)}.`,
        };
      }

      if (enforceUsdtCapacity && parserRate !== undefined) {
        const reserved = pendingPayinUsdtDebit.get(row.traderId) ?? 0;
        const cap =
          (usdtBal.get(row.traderId) ?? 0) +
          (overdraft.get(row.traderId) ?? 0) -
          reserved;
        const need = a / (parserRate * (1 + Number(row.payinRate)));
        if (need > cap + 1e-9) {
          return {
            ok: false,
            code: 'USDT_CAPACITY_INSUFFICIENT',
            detail: `Required ≈${need.toFixed(4)} USDT (with pay-in rate) exceeds trader capacity ${cap.toFixed(4)} USDT (balance + overdraft − pending pay-in debits).`,
          };
        }
      }
      return { ok: true };
    };

    if (tryAnyNominal) {
      if (nominalAmounts.length === 0) {
        const z = checkAmountForAssign(amount);
        if (!z.ok) return z;
      } else {
        let lastFail: { ok: false; code: string; detail: string } | null = null;
        let anyOk = false;
        for (const n of [...nominalAmounts].sort((a, b) => a - b)) {
          const c = checkAmountForAssign(n);
          if (c.ok) {
            anyOk = true;
            break;
          }
          lastFail = c;
        }
        if (!anyOk) {
          return (
            lastFail ?? {
              ok: false,
              code: 'AMOUNT_OUTSIDE_EFFECTIVE_RANGE',
              detail: 'No amount on the coverage nominal grid fits this requisite.',
            }
          );
        }
      }
    } else {
      const first = checkAmountForAssign(amount);
      if (!first.ok) return first;
    }

    const idleMs =
      idleMsByRequisiteId?.get(row.id) ??
      effectiveIdleMs(nowMs, new Date(row.cascadeIdleAnchorAt).getTime());
    const lim = Number(row.limitTotalAmount);
    const confirmed = Number(row.confirmedPayinAmount);
    const cf01 = confirmedPayinFillRatio(confirmed, lim);
    const score =
      assignmentTier === 'FORK'
        ? forkCascadeRaceScore({
            idleMs,
            confirmedFill01: cf01,
            traderMultiplier: Math.max(1e-9, row.cascadeRatingMultiplier),
            payinAssignmentsCount: row.payinAssignmentsCount,
            fillTiers,
          })
        : cardCascadeRaceScore({
            idleMs,
            traderMultiplier: Math.max(1e-9, row.cascadeRatingMultiplier),
          });
    return { ok: true, score };
  }

  private rankCandidatesForPayInTier(
    tier: 'FORK' | 'CARD',
    snapshotsWithCapacity: ReqSnapshot[],
    amount: number,
    snapshotsForCoverage: ReqSnapshot[],
    nominalAmounts: number[],
    settings: CascadeSetting,
    usdtBal: Map<string, number>,
    overdraft: Map<string, number>,
    pendingPayinUsdtDebit: Map<string, number>,
    parserRate: number | undefined,
    enforceUsdtCapacity: boolean,
    nowMs: number,
    fillTiers: readonly FillMultiplierTier[] | null,
    idleMsByRequisiteId?: ReadonlyMap<string, number>,
    tryAnyNominal = false,
    occupiedByRequisiteId: ReadonlyMap<string, readonly number[]> = new Map(),
  ): Array<{
    id: string;
    score: number;
    traderId: string;
    assignmentLevel: 'FORK' | 'CARD';
  }> {
    const pool = snapshotsWithCapacity.filter((row) => {
      const pm = row.processingMethod as TraderCascadeMethod;
      if (tier === 'FORK' && pm !== 'FORK') return false;
      if (tier === 'CARD' && pm !== 'CARD') return false;
      return true;
    });

    return pool
      .map((row) => {
        const ev = this.evaluateSnapshotForPayInAmount(
          row,
          amount,
          snapshotsForCoverage,
          nominalAmounts,
          settings,
          usdtBal,
          overdraft,
          pendingPayinUsdtDebit,
          parserRate,
          enforceUsdtCapacity,
          nowMs,
          tier,
          fillTiers,
          idleMsByRequisiteId,
          tryAnyNominal,
          occupiedByRequisiteId.get(row.id) ?? [],
          occupiedByRequisiteId,
        );
        if (!ev.ok) return null;
        return {
          id: row.id,
          score: ev.score,
          traderId: row.traderId,
          assignmentLevel: tier,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  /** In-flight Pay-In amounts per requisite (blocks duplicate fiat amount on the same card). */
  private async getOccupiedPayInAmountsByRequisiteId(
    db: PrismaService | Prisma.TransactionClient,
    requisiteIds: string[],
    excludePayinOrderId?: string,
  ): Promise<Map<string, number[]>> {
    const unique = [...new Set(requisiteIds)];
    if (unique.length === 0) return new Map();

    const rows = await db.payinOrder.findMany({
      where: {
        requisiteId: { in: unique },
        status: { in: PAYIN_STATUS_SAME_AMOUNT_BLOCKING },
        ...(excludePayinOrderId ? { NOT: { id: excludePayinOrderId } } : {}),
      },
      select: { requisiteId: true, amount: true },
    });

    const byRequisite = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.requisiteId) continue;
      const list = byRequisite.get(row.requisiteId) ?? [];
      list.push(Number(row.amount));
      byRequisite.set(row.requisiteId, list);
    }
    return byRequisite;
  }

  private async getPendingPayinUsdtDebitByTrader(
    db: PrismaService | Prisma.TransactionClient,
  ): Promise<Map<string, number>> {
    const rows = await db.payinOrder.findMany({
      where: {
        traderId: { not: null },
        status: { in: PAYIN_STATUS_PENDING_USDT_SETTLEMENT },
        rateTraderIn: { not: null },
        currency: { code: 'UAH' },
      },
      select: { traderId: true, amount: true, rateTraderIn: true },
    });
    const byTrader = new Map<string, number>();
    for (const r of rows) {
      if (!r.traderId) continue;
      const fiat = Number(r.amount);
      const rt = Number(r.rateTraderIn);
      if (!(fiat > 0) || !(rt > 0) || !Number.isFinite(fiat) || !Number.isFinite(rt)) {
        continue;
      }
      const usdt = fiat / rt;
      byTrader.set(r.traderId, (byTrader.get(r.traderId) ?? 0) + usdt);
    }
    return byTrader;
  }

  private async getUsdtCapacityMaps(
    db: PrismaService | Prisma.TransactionClient,
  ): Promise<{
    usdtBal: Map<string, number>;
    overdraft: Map<string, number>;
    pendingPayinUsdtDebit: Map<string, number>;
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
    const pendingPayinUsdtDebit = await this.getPendingPayinUsdtDebitByTrader(db);
    return { usdtBal, overdraft, pendingPayinUsdtDebit };
  }

  /**
   * Method-level cascade ordering for a hypothetical Pay-In amount (TZ v3.1): primary tier is always
   * Fork or Card (traffic %), then the alternate tier, never Provider first. Global idle-time race
   * ranks requisites within each tier (Provider stubbed for ordered preview).
   */
  private async buildOrderedRequisiteIdsForAmount(
    db: PrismaService | Prisma.TransactionClient,
    args: {
      currency: string;
      currencyId: string;
      amount: number;
      /** When true, include requisites eligible for at least one nominal on the coverage grid (assignment preview). */
      anyNominal?: boolean;
      parserRate?: number;
      enforceUsdtCapacity: boolean;
      settings: CascadeSetting;
      nominalAmounts: number[];
      reqRows: ReqSnapshot[];
      levelCredits: { fork: number; card: number; provider: number };
      nowMs: number;
      rng?: () => number;
    },
  ): Promise<{
    ordered: Array<{
      id: string;
      score: number;
      traderId: string;
      assignmentLevel: 'FORK' | 'CARD';
    }>;
    primaryCascadeLevel: CascadeAssignmentLevel;
  }> {
    const {
      amount,
      anyNominal = false,
      parserRate,
      enforceUsdtCapacity,
      settings,
      nominalAmounts,
      reqRows,
      levelCredits,
      nowMs,
      rng,
    } = args;

    const fillTiers = parseFillMultiplierTiersJson(settings.fillMultipliersConfig);

    const targetsPct = {
      fork: Number(settings.forkTrafficPercent),
      card: Number(settings.cardTrafficPercent),
      provider: Number(settings.providerTrafficPercent),
    };

    const primary =
      settings.levelPickMode === 'STOCHASTIC'
        ? pickPrimaryCascadeLevelStochastic(targetsPct, rng ?? Math.random)
        : pickPrimaryCascadeLevelDebt(levelCredits, targetsPct);

    const levelOrder = cascadeLevelAttemptOrder(primary).filter((lvl) => lvl !== 'PROVIDER');

    const { usdtBal, overdraft, pendingPayinUsdtDebit } = await this.getUsdtCapacityMaps(db);

    const idleMsByRequisiteId = await this.fetchRequisiteIdleMsFromDb(db, [
      ...new Set(reqRows.map((r) => r.id)),
    ]);

    const occupiedByRequisiteId = await this.getOccupiedPayInAmountsByRequisiteId(
      db,
      reqRows.map((r) => r.id),
    );

    const snapshots = reqRows.filter((row) => {
      const remAmt = roundMoney2(Number(row.limitTotalAmount) - Number(row.usedAmount));
      if (anyNominal) return remAmt > MONEY_COMPARE_EPS;
      return remAmt >= roundMoney2(amount) - MONEY_COMPARE_EPS;
    });

    const orderedReqIds: Array<{
      id: string;
      score: number;
      traderId: string;
      assignmentLevel: 'FORK' | 'CARD';
    }> = [];

    for (const level of levelOrder) {
      if (level !== 'FORK' && level !== 'CARD') continue;
      const ranked = this.rankCandidatesForPayInTier(
        level,
        snapshots,
        amount,
        snapshots,
        nominalAmounts,
        settings,
        usdtBal,
        overdraft,
        pendingPayinUsdtDebit,
        parserRate,
        enforceUsdtCapacity,
        nowMs,
        fillTiers,
        idleMsByRequisiteId,
        anyNominal,
        occupiedByRequisiteId,
      );
      orderedReqIds.push(...ranked);
    }

    return { ordered: orderedReqIds, primaryCascadeLevel: primary };
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

    const fillTiers = parseFillMultiplierTiersJson(settings.fillMultipliersConfig);
    const fillConfigFingerprint = fillMultiplierConfigFingerprint(settings.fillMultipliersConfig);

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
        cascadeIdleAnchorAt: Date;
        payinAssignmentsCount: number;
        cascadeRatingMultiplier: Prisma.Decimal;
        confirmedPayinAmount: Prisma.Decimal;
      }>
    >`
      SELECT
        r.id,
        r.trader_id AS "traderId",
        tp.processing_method AS "processingMethod",
        r.used_amount::numeric AS "usedAmount",
        r.limit_total_amount::numeric AS "limitTotalAmount",
        r.confirmed_payin_amount::numeric AS "confirmedPayinAmount",
        r.used_ops AS "usedOps",
        r.limit_total_ops AS "limitTotalOps",
        r.min_amount::numeric AS "minAmount",
        r.max_amount::numeric AS "maxAmount",
        tp.payin_rate::numeric AS "payinRate",
        r.cascade_idle_anchor_at AS "cascadeIdleAnchorAt",
        r.payin_assignments_count AS "payinAssignmentsCount",
        tp.cascade_rating_multiplier::numeric AS "cascadeRatingMultiplier"
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

    const occupiedByRequisiteId = await this.getOccupiedPayInAmountsByRequisiteId(
      db,
      reqs.map((r) => r.id),
    );

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
        if (!nominalCoveredByRange(n, range.min, range.max)) continue;
        if (payInAmountBlockedOnRequisite(occupiedByRequisiteId.get(row.id) ?? [], n)) {
          continue;
        }
        count++;
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

    const currencyRow = await db.currency.findUnique({
      where: { code: cur },
      select: { id: true },
    });
    if (!currencyRow) {
      throw new Error(`currency not found: ${cur}`);
    }

    const debtRow = await db.cascadeLevelDebt.findUnique({
      where: { currencyId: currencyRow.id },
    });
    const levelCredits = debtRow
      ? {
          fork: Number(debtRow.forkCredit),
          card: Number(debtRow.cardCredit),
          provider: Number(debtRow.providerCredit),
        }
      : { fork: 0, card: 0, provider: 0 };

    const builtNow = Date.now();

    const previewOrder = await this.buildOrderedRequisiteIdsForAmount(db, {
      currency: cur,
      currencyId: currencyRow.id,
      amount: previewAmount,
      parserRate,
      enforceUsdtCapacity: enforceUsdt,
      settings,
      nominalAmounts,
      reqRows: reqs,
      levelCredits,
      nowMs: builtNow,
    });

    const rankById = new Map<string, number>();
    for (let i = 0; i < previewOrder.ordered.length; i++) {
      rankById.set(previewOrder.ordered[i]!.id, i + 1);
    }
    const eligiblePreview = new Set(previewOrder.ordered.map((x) => x.id));

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
          if (!nominalCoveredByRange(n, range.min, range.max)) continue;
          if (payInAmountBlockedOnRequisite(occupiedByRequisiteId.get(other.id) ?? [], n)) {
            continue;
          }
          c++;
        }
        coverageCounts.set(n, c);
      }

      const bounds = computeForkAssignBounds(
        forkInp,
        nominalAmounts,
        (nominal) => coverageCounts.get(nominal) ?? 0,
      );

      const idleMs = effectiveIdleMs(builtNow, new Date(row.cascadeIdleAnchorAt).getTime());
      const newcomerBoost = newcomerRatingBoostMultiplier(row.payinAssignmentsCount);
      const confirmedAmt = Number(row.confirmedPayinAmount);
      const cf01 = confirmedPayinFillRatio(confirmedAmt, lim);
      const fillMult = fillMultiplierFromConfirmedFill(cf01, fillTiers);
      const pmRow = row.processingMethod as TraderCascadeMethod;
      const raceSc =
        pmRow === 'FORK'
          ? forkCascadeRaceScore({
              idleMs,
              confirmedFill01: cf01,
              traderMultiplier: Math.max(1e-9, row.cascadeRatingMultiplier),
              payinAssignmentsCount: row.payinAssignmentsCount,
              fillTiers,
            })
          : cardCascadeRaceScore({
              idleMs,
              traderMultiplier: Math.max(1e-9, row.cascadeRatingMultiplier),
            });

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
        confirmed_fill_ratio: Math.round(cf01 * 1e6) / 1e6,
        fill_multiplier: fillMult,
        remaining_amount: Math.round(remAmt * 1e4) / 1e4,
        remaining_transactions: remTx,
        effective_min: bounds ? bounds.effMin : null,
        effective_max: bounds ? bounds.effMax : null,
        fork_autolimit_active: activ,
        idle_ms: Math.round(idleMs),
        newcomer_boost: newcomerBoost,
        race_score: Math.round(raceSc * 1e6) / 1e6,
        weighted_score: Math.round(raceSc * 1e6) / 1e6,
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
        cascadeIdleAnchorAt: r.cascadeIdleAnchorAt,
        payinAssignmentsCount: r.payinAssignmentsCount,
        cascadeRatingMultiplier: r.cascadeRatingMultiplier,
        confirmedPayinAmount: r.confirmedPayinAmount,
      })),
    );

    return {
      payload_version: 6,
      snapshot_row_sig: sig,
      fill_config_fingerprint: fillConfigFingerprint,
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
      Array<{
        id: string;
        usedAmount: Prisma.Decimal;
        usedOps: number;
        cascadeIdleAnchorAt: Date;
        payinAssignmentsCount: number;
        cascadeRatingMultiplier: Prisma.Decimal;
        confirmedPayinAmount: Prisma.Decimal;
      }>
    >`
      SELECT
        r.id,
        r.used_amount::numeric AS "usedAmount",
        r.used_ops AS "usedOps",
        r.cascade_idle_anchor_at AS "cascadeIdleAnchorAt",
        r.payin_assignments_count AS "payinAssignmentsCount",
        tp.cascade_rating_multiplier::numeric AS "cascadeRatingMultiplier",
        r.confirmed_payin_amount::numeric AS "confirmedPayinAmount"
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
        cascadeIdleAnchorAt: r.cascadeIdleAnchorAt.toISOString(),
        payinAssignmentsCount: r.payinAssignmentsCount,
        cascadeRatingMultiplier: Number(r.cascadeRatingMultiplier),
        confirmedPayinAmount: Number(r.confirmedPayinAmount),
      })),
    );
  }

  /**
   * Pay-In requisite selection (TZ v3.1): method-level primary bucket + global idle-time race;
   * Fork autolimits still gate effective bounds. Updates `cascade_level_debts` on success (same tx).
   */
  async lockBestRequisiteForPayIn(
    tx: Prisma.TransactionClient,
    params: {
      amount: number;
      currency: string;
      /** Parser reference rate (local fiat per 1 USDT) when enforcing trader USDT capacity */
      parserRate?: number;
      enforceUsdtCapacity: boolean;
      /** Idempotency key forwarded to external provider reserve API (stable per Pay-In attempt). */
      providerIdempotencyKey: string;
      attemptProviderTier?: (
        db: Prisma.TransactionClient,
        ctx: {
          amount: number;
          currency: string;
          parserRate?: number;
          idempotencyKey: string;
        },
      ) => Promise<
        | { kind: 'accepted'; externalRef: string }
        | { kind: 'declined' }
        | { kind: 'unavailable' }
      >;
      rng?: () => number;
    },
  ): Promise<CascadePickResult> {
    const cascadeStarted = Date.now();
    let redisLockContentionEvents = 0;
    let candidatesTried = 0;
    let providerOutcome: 'not_attempted' | 'declined' | 'unavailable' = 'not_attempted';

    const settings = await tx.cascadeSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!settings) {
      throw new Error('cascade_settings row missing');
    }

    const fillTiers = parseFillMultiplierTiersJson(settings.fillMultipliersConfig);
    const fillFingerprint = fillMultiplierConfigFingerprint(settings.fillMultipliersConfig);

    const nominalRows = await tx.coverageNominalSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const nominalAmounts = nominalRows.map((n) => Number(n.amount));

    const cur = params.currency.trim().toUpperCase();

    const currencyRow = await tx.currency.findUnique({
      where: { code: cur },
      select: { id: true },
    });
    if (!currencyRow) {
      throw new Error(`currency not found: ${cur}`);
    }

    const debtRow = await tx.cascadeLevelDebt.findUnique({
      where: { currencyId: currencyRow.id },
    });
    const levelCredits = debtRow
      ? {
          fork: Number(debtRow.forkCredit),
          card: Number(debtRow.cardCredit),
          provider: Number(debtRow.providerCredit),
        }
      : { fork: 0, card: 0, provider: 0 };

    const txSig = await this.computeSnapshotSignatureFromTx(tx, cur);

    let reqRows: ReqSnapshot[];

    const cachedPayload = await this.redisState.getPayload(cur);
    if (
      cachedPayload?.snapshot_row_sig === txSig &&
      cachedPayload.payload_version === 6 &&
      cachedPayload.fill_config_fingerprint === fillFingerprint
    ) {
      reqRows = cachedPayload.snapshots.map(stripRedisMeta);
    } else {
      const payload = await this.buildCurrencyPayload(tx, cur);
      await this.redisState.setPayload(cur, payload);
      reqRows = payload.snapshots.map(stripRedisMeta);
    }

    const targetsPct = {
      fork: Number(settings.forkTrafficPercent),
      card: Number(settings.cardTrafficPercent),
      provider: Number(settings.providerTrafficPercent),
    };

    const primary: CascadeAssignmentLevel =
      settings.levelPickMode === 'STOCHASTIC'
        ? pickPrimaryCascadeLevelStochastic(targetsPct, params.rng ?? Math.random)
        : pickPrimaryCascadeLevelDebt(levelCredits, targetsPct);

    const tierOrder = cascadeLevelAttemptOrder(primary);

    const assignNowMs = Date.now();
    const { usdtBal, overdraft, pendingPayinUsdtDebit } = await this.getUsdtCapacityMaps(tx);

    const snapshots = reqRows.filter((row) => {
      const remAmt = roundMoney2(Number(row.limitTotalAmount) - Number(row.usedAmount));
      return remAmt >= roundMoney2(params.amount) - MONEY_COMPARE_EPS;
    });

    const idleMsByRequisiteId = await this.fetchRequisiteIdleMsFromDb(tx, [
      ...new Set(snapshots.map((r) => r.id)),
    ]);

    const occupiedByRequisiteId = await this.getOccupiedPayInAmountsByRequisiteId(
      tx,
      snapshots.map((r) => r.id),
    );

    const applyDebtCredits = async () => {
      const nextCredits = applyCascadeCreditsAfterAssignment(levelCredits, targetsPct, primary);
      await tx.cascadeLevelDebt.upsert({
        where: { currencyId: currencyRow.id },
        create: {
          currencyId: currencyRow.id,
          forkCredit: nextCredits.fork,
          cardCredit: nextCredits.card,
          providerCredit: nextCredits.provider,
        },
        update: {
          forkCredit: nextCredits.fork,
          cardCredit: nextCredits.card,
          providerCredit: nextCredits.provider,
        },
      });
    };

    for (const tier of tierOrder) {
      if (tier === 'PROVIDER') {
        const bridge = params.attemptProviderTier
          ? await params.attemptProviderTier(tx, {
              amount: params.amount,
              currency: cur,
              parserRate: params.parserRate,
              idempotencyKey: params.providerIdempotencyKey,
            })
          : undefined;
        if (bridge?.kind === 'accepted') {
          await applyDebtCredits();
          const duration_ms = Date.now() - cascadeStarted;
          this.logger.log({
            msg: 'cascade.assign_complete',
            event: 'cascade_assign_duration_ms',
            duration_ms,
            currency: cur,
            amount: params.amount,
            outcome: 'assigned_provider',
            external_ref: bridge.externalRef,
            assignment_level: 'PROVIDER',
            primary_level: primary,
            redis_lock_contention_events: redisLockContentionEvents,
          });
          return {
            kind: 'provider',
            providerExternalRef: bridge.externalRef,
            score: 0,
            assignmentLevel: 'PROVIDER',
            primaryCascadeLevel: primary,
            landedCascadeLevel: 'PROVIDER',
          };
        }
        if (bridge?.kind === 'declined') {
          providerOutcome = 'declined';
        } else if (bridge?.kind === 'unavailable') {
          providerOutcome = 'unavailable';
        }
        continue;
      }

      const ranked = this.rankCandidatesForPayInTier(
        tier,
        snapshots,
        params.amount,
        snapshots,
        nominalAmounts,
        settings,
        usdtBal,
        overdraft,
        pendingPayinUsdtDebit,
        params.parserRate,
        params.enforceUsdtCapacity,
        assignNowMs,
        fillTiers,
        idleMsByRequisiteId,
        false,
        occupiedByRequisiteId,
      );

      for (const cand of ranked) {
        candidatesTried += 1;
        const { id, score, assignmentLevel } = cand;
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

        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            used_amount: Prisma.Decimal;
            limit_total_amount: Prisma.Decimal;
            used_ops: number;
            limit_total_ops: number;
          }>
        >`
          SELECT id, used_amount, limit_total_amount, used_ops, limit_total_ops
          FROM requisites
          WHERE id = CAST(${id} AS uuid)
          FOR UPDATE SKIP LOCKED
        `;

        if (locked.length !== 1) {
          await this.redisState.releaseRequisiteLock(id);
          continue;
        }

        const head = locked[0];
        const ua = Number(head.used_amount);
        const limAmt = Number(head.limit_total_amount);
        const uo = head.used_ops;
        const limO = head.limit_total_ops;
        if (
          Number.isFinite(limAmt) &&
          limAmt > 0 &&
          roundMoney2(ua + params.amount) > roundMoney2(limAmt) + MONEY_COMPARE_EPS
        ) {
          await this.redisState.releaseRequisiteLock(id);
          continue;
        }
        if (limO > 0 && uo + 1 > limO) {
          await this.redisState.releaseRequisiteLock(id);
          continue;
        }

        const row = snapshots.find((s) => s.id === id);
        if (!row) {
          await this.redisState.releaseRequisiteLock(id);
          continue;
        }

        const blockingOnRequisite = await tx.payinOrder.findMany({
          where: {
            requisiteId: id,
            status: { in: PAYIN_STATUS_SAME_AMOUNT_BLOCKING },
          },
          select: { amount: true },
        });
        if (
          blockingOnRequisite.some(
            (o) =>
              Math.abs(roundMoney2(Number(o.amount)) - roundMoney2(params.amount)) <=
              MONEY_COMPARE_EPS,
          )
        ) {
          await this.redisState.releaseRequisiteLock(id);
          this.logger.log({
            msg: 'cascade.same_amount_blocked',
            event: 'cascade_same_amount_blocked',
            requisite_id: id,
            currency: cur,
            amount: params.amount,
          });
          continue;
        }

        await applyDebtCredits();

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
          assignment_level: assignmentLevel,
          primary_level: primary,
          score,
          redis_lock_contention_events: redisLockContentionEvents,
        });
        return {
          kind: 'trader',
          requisiteId: id,
          traderId: row.traderId,
          score,
          assignmentLevel,
          primaryCascadeLevel: primary,
          landedCascadeLevel: tier,
          redisLockHeld: true,
        };
      }
    }

    const noMatch = this.classifyPayInNoMatch({
      reqRows,
      snapshots,
      candidatesTried,
      amount: params.amount,
      providerOutcome,
      nominalAmounts,
      settings,
      usdtBal,
      overdraft,
      pendingPayinUsdtDebit,
      parserRate: params.parserRate,
      enforceUsdtCapacity: params.enforceUsdtCapacity,
      assignNowMs,
      fillTiers,
      idleMsByRequisiteId,
      occupiedByRequisiteId,
    });

    const duration_ms = Date.now() - cascadeStarted;
    this.logger.log({
      msg: 'cascade.assign_exhausted',
      event: 'cascade_assign_duration_ms',
      duration_ms,
      currency: cur,
      amount: params.amount,
      outcome: 'no_match',
      no_requisite_reason: noMatch.reason,
      redis_lock_contention_events: redisLockContentionEvents,
      candidates_tried: candidatesTried,
      provider_outcome: providerOutcome,
    });
    this.logger.warn(
      `No suitable requisite for ${params.amount} ${params.currency} after cascade (${noMatch.reason})`,
    );
    return noMatch;
  }

  /** Classify why Pay-In cascade could not assign a requisite (persisted on NO_REQUISITE orders). */
  private classifyPayInNoMatch(args: {
    reqRows: ReqSnapshot[];
    snapshots: ReqSnapshot[];
    candidatesTried: number;
    amount: number;
    providerOutcome: 'not_attempted' | 'declined' | 'unavailable';
    nominalAmounts: number[];
    settings: CascadeSetting;
    usdtBal: Map<string, number>;
    overdraft: Map<string, number>;
    pendingPayinUsdtDebit: Map<string, number>;
    parserRate: number | undefined;
    enforceUsdtCapacity: boolean;
    assignNowMs: number;
    fillTiers: readonly FillMultiplierTier[] | null;
    idleMsByRequisiteId: Map<string, number>;
    occupiedByRequisiteId: Map<string, number[]>;
  }): CascadeNoMatch {
    if (args.reqRows.length === 0) {
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.NO_ACTIVE_REQUISITES,
        detail: 'Cascade snapshot has no active requisites for this currency.',
      };
    }

    if (args.snapshots.length === 0) {
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.REQUISITE_TOTAL_LIMIT_EXCEEDED,
        detail: `No requisite has remaining total amount headroom for ${roundMoney2(args.amount).toFixed(2)}.`,
      };
    }

    if (args.candidatesTried > 0) {
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.ASSIGNMENT_CONTENTION,
        detail: `Cascade tried ${args.candidatesTried} ranked requisite(s) but none could be locked.`,
      };
    }

    const failCounts = new Map<string, number>();
    let lastFailDetail: string | undefined;
    let anyEvalOk = false;

    for (const tier of ['FORK', 'CARD'] as const) {
      for (const row of args.snapshots) {
        const pm = row.processingMethod as TraderCascadeMethod;
        if (tier === 'FORK' && pm !== 'FORK') continue;
        if (tier === 'CARD' && pm !== 'CARD') continue;

        const ev = this.evaluateSnapshotForPayInAmount(
          row,
          args.amount,
          args.snapshots,
          args.nominalAmounts,
          args.settings,
          args.usdtBal,
          args.overdraft,
          args.pendingPayinUsdtDebit,
          args.parserRate,
          args.enforceUsdtCapacity,
          args.assignNowMs,
          tier,
          args.fillTiers,
          args.idleMsByRequisiteId,
          false,
          args.occupiedByRequisiteId.get(row.id) ?? [],
          args.occupiedByRequisiteId,
        );
        if (ev.ok) {
          anyEvalOk = true;
        } else {
          failCounts.set(ev.code, (failCounts.get(ev.code) ?? 0) + 1);
          lastFailDetail = ev.detail;
        }
      }
    }

    if (!anyEvalOk) {
      const usdtFails = failCounts.get('USDT_CAPACITY_INSUFFICIENT') ?? 0;
      const totalFails = [...failCounts.values()].reduce((a, b) => a + b, 0);
      if (usdtFails > 0 && usdtFails === totalFails) {
        return {
          kind: 'none',
          reason: PayinNoRequisiteReason.USDT_CAPACITY_INSUFFICIENT,
          detail: lastFailDetail,
        };
      }
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.NO_MATCHING_AMOUNT_OR_RANGE,
        detail: lastFailDetail,
      };
    }

    if (args.providerOutcome === 'declined') {
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.PROVIDER_DECLINED,
        detail: 'External provider bridge declined this Pay-In reservation.',
      };
    }
    if (args.providerOutcome === 'unavailable') {
      return {
        kind: 'none',
        reason: PayinNoRequisiteReason.PROVIDER_UNAVAILABLE,
        detail: 'External provider bridge is disabled or unavailable.',
      };
    }

    return {
      kind: 'none',
      reason: PayinNoRequisiteReason.ASSIGNMENT_CONTENTION,
      detail: lastFailDetail ?? 'Eligible requisites existed but assignment did not complete.',
    };
  }

  /**
   * Pay-In assignment bounds shown in the trader cabinet.
   * eff_min follows Fork autolimit floor when active; eff_max is assignable headroom
   * (min(manual max, remaining amount)), not the nominal auto_max slice used for coverage.
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
      const rawSnaps = await this.prisma.$queryRaw<
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
          cascadeIdleAnchorAt: Date;
          payinAssignmentsCount: number;
          cascadeRatingMultiplier: Prisma.Decimal;
          confirmedPayinAmount: Prisma.Decimal;
        }>
      >`
        SELECT
          r.id,
          r.trader_id AS "traderId",
          tp.processing_method AS "processingMethod",
          r.used_amount::numeric AS "usedAmount",
          r.limit_total_amount::numeric AS "limitTotalAmount",
          r.confirmed_payin_amount::numeric AS "confirmedPayinAmount",
          r.used_ops AS "usedOps",
          r.limit_total_ops AS "limitTotalOps",
          r.min_amount::numeric AS "minAmount",
          r.max_amount::numeric AS "maxAmount",
          tp.payin_rate::numeric AS "payinRate",
          r.cascade_idle_anchor_at AS "cascadeIdleAnchorAt",
          r.payin_assignments_count AS "payinAssignmentsCount",
          tp.cascade_rating_multiplier::numeric AS "cascadeRatingMultiplier"
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
      const snaps = this.normalizeAssignmentRows(rawSnaps);
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

      const assignMax = payInAssignMax(forkInp);
      requisites.push({
        requisite_id: req.id,
        currency: req.currency.code,
        manual_min: manualMin,
        manual_max: manualMax,
        eff_min: bounds ? bounds.effMin : null,
        eff_max: bounds && assignMax !== null ? assignMax : null,
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
    preview_amount: number | null;
    cascade_context: {
      level_pick_mode: CascadeLevelPickMode;
      fork_traffic_percent: number;
      card_traffic_percent: number;
      provider_traffic_percent: number;
      autolimit_enabled: boolean;
      autolimit_threshold: number;
      fork_credit: number;
      card_credit: number;
      provider_credit: number;
      debt_primary_preview: 'FORK' | 'CARD' | null;
      redis_rank_preview_amount: number;
      fill_config_fingerprint: string;
    };
    rows: Array<Record<string, unknown>>;
  }> {
    const cur = options.currency.trim().toUpperCase();
    const settings = await this.getSettings();
    const fillTiers = parseFillMultiplierTiersJson(settings.fillMultipliersConfig);
    const fillFingerprint = fillMultiplierConfigFingerprint(settings.fillMultipliersConfig);
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

    let payload = await this.redisState.getPayload(cur);
    if (
      !payload ||
      payload.payload_version !== 6 ||
      payload.fill_config_fingerprint !== fillFingerprint
    ) {
      payload = await this.buildCurrencyPayload(this.prisma, cur);
      await this.redisState.setPayload(cur, payload);
    }

    const currencyRow = await this.prisma.currency.findUnique({
      where: { code: cur },
      select: { id: true },
    });
    const debtRow =
      currencyRow &&
      (await this.prisma.cascadeLevelDebt.findUnique({
        where: { currencyId: currencyRow.id },
      }));
    const levelCredits = debtRow
      ? {
          fork: Number(debtRow.forkCredit),
          card: Number(debtRow.cardCredit),
          provider: Number(debtRow.providerCredit),
        }
      : { fork: 0, card: 0, provider: 0 };

    const ratingsNowMs = Date.now();

    const strip = (s: CascadeStoredSnapshot): ReqSnapshot => {
      const { redis_meta: _rm, ...rest } = s;
      return rest;
    };

    let rankById = new Map<string, number>();
    let eligiblePreview = new Set<string>();
    let responsePreviewAmount: number | null;

    if (options.preview_amount === undefined) {
      responsePreviewAmount = null;
      if (!currencyRow) {
        eligiblePreview = new Set();
      } else {
        const previewRanked = await this.buildOrderedRequisiteIdsForAmount(this.prisma, {
          currency: cur,
          currencyId: currencyRow.id,
          amount: 0,
          anyNominal: true,
          parserRate,
          enforceUsdtCapacity: enforceUsdt,
          settings,
          nominalAmounts,
          reqRows: payload.snapshots.map(strip),
          levelCredits,
          nowMs: ratingsNowMs,
        });
        for (let i = 0; i < previewRanked.ordered.length; i++) {
          rankById.set(previewRanked.ordered[i]!.id, i + 1);
        }
        eligiblePreview = new Set(previewRanked.ordered.map((o) => o.id));
      }
    } else {
      const previewAmount = options.preview_amount;
      responsePreviewAmount = previewAmount;
      if (Math.abs(previewAmount - payload.preview_amount) < 1e-9) {
        for (const s of payload.snapshots) {
          const rk = s.redis_meta?.cascade_rank;
          if (rk != null) rankById.set(s.id, rk);
          if (s.redis_meta?.is_eligible_preview) eligiblePreview.add(s.id);
        }
      } else {
        if (!currencyRow) {
          eligiblePreview = new Set();
        } else {
          const previewRanked = await this.buildOrderedRequisiteIdsForAmount(this.prisma, {
            currency: cur,
            currencyId: currencyRow.id,
            amount: previewAmount,
            parserRate,
            enforceUsdtCapacity: enforceUsdt,
            settings,
            nominalAmounts,
            reqRows: payload.snapshots.map(strip),
            levelCredits,
            nowMs: ratingsNowMs,
          });
          for (let i = 0; i < previewRanked.ordered.length; i++) {
            rankById.set(previewRanked.ordered[i]!.id, i + 1);
          }
          eligiblePreview = new Set(previewRanked.ordered.map((o) => o.id));
        }
      }
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
            cascadeRatingMultiplier: true,
            user: { select: { email: true } },
          },
        },
      },
    });

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
      idle_ms: number;
      confirmed_fill_ratio: number;
      fill_ladder_multiplier: number | null;
      fill_leg_multiplier: number | null;
      trader_multiplier: number;
      effective_race_multiplier: number;
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
    const [locks, assigns, idleMsById] = await Promise.all([
      this.redisState.areRequisitesLocked(ids),
      this.redisState.getRequisiteAssignmentMetaMany(ids),
      this.fetchRequisiteIdleMsFromDb(this.prisma, ids),
    ]);

    const methodF = (options.method ?? 'ALL').toUpperCase();
    const statusF = options.status_filter ?? 'active';

    const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

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
      // Idle relative to DB clock (anchor is set with SQL NOW()); avoids Node vs Postgres skew showing 0 everywhere.
      const idleMsFb =
        idleMsById.get(r.id) ??
        effectiveIdleMs(ratingsNowMs, r.cascadeIdleAnchorAt.getTime());
      const traderMultFb = Math.max(1e-9, Number(r.trader.cascadeRatingMultiplier));
      const confirmedAmtFb = Number(r.confirmedPayinAmount);
      const cf01Fb = confirmedPayinFillRatio(confirmedAmtFb, lim);
      const pmFb = r.trader.processingMethod as TraderCascadeMethod;
      // Staff observability: idle and race score must reflect "now", not redis_meta
      // captured at the last snapshot build (otherwise Idle/Race score look stuck at 0).
      const weighted =
        pmFb === 'FORK'
          ? forkCascadeRaceScore({
              idleMs: idleMsFb,
              confirmedFill01: cf01Fb,
              traderMultiplier: traderMultFb,
              payinAssignmentsCount: r.payinAssignmentsCount,
              fillTiers,
            })
          : cardCascadeRaceScore({
              idleMs: idleMsFb,
              traderMultiplier: traderMultFb,
            });

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

      const confirmedRatio =
        meta?.confirmed_fill_ratio !== undefined ? meta.confirmed_fill_ratio : round6(cf01Fb);
      const idleMsRounded = Math.round(idleMsFb);

      let fillLadderMult: number | null = null;
      let fillLegMult: number | null = null;
      if (pmFb === 'FORK') {
        fillLadderMult = round6(
          meta?.fill_multiplier ?? fillMultiplierFromConfirmedFill(cf01Fb, fillTiers),
        );
        fillLegMult = round6(
          Math.max(fillLadderMult, newcomerRatingBoostMultiplier(r.payinAssignmentsCount)),
        );
      }

      const effRaceMult =
        pmFb === 'FORK' && fillLegMult !== null
          ? round6(Math.max(fillLegMult, traderMultFb))
          : round6(traderMultFb);

      const q = options.q?.trim().toLowerCase();
      if (q) {
        const email = (r.trader.user.email ?? '').toLowerCase();
        const masked = maskRequisiteNumber(r.number).toLowerCase();
        if (!email.includes(q) && !masked.includes(q) && !r.id.toLowerCase().includes(q)) {
          continue;
        }
      }

      rows.push({
        requisite_id: r.id,
        trader_id: r.traderId,
        trader_label: r.trader.user.email ?? r.traderId,
        processing_method: pm,
        requisite_masked: maskRequisiteNumber(r.number),
        is_active: r.isActive,
        is_in_cascade_pool: inPool,
        fill_ratio: fr,
        fill_ratio_tx: frTx,
        rating,
        weighted_score: Math.round(weighted * 1e6) / 1e6,
        idle_ms: idleMsRounded,
        confirmed_fill_ratio: confirmedRatio,
        fill_ladder_multiplier: fillLadderMult,
        fill_leg_multiplier: fillLegMult,
        trader_multiplier: round6(traderMultFb),
        effective_race_multiplier: effRaceMult,
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
      else if (sort === 'rating') c = (a.weighted_score - b.weighted_score) * dir;
      else if (sort === 'trader')
        c = a.trader_label.localeCompare(b.trader_label) * dir;
      else if (sort === 'remainder')
        c = (a.remaining_amount - b.remaining_amount) * dir;
      else if (sort === 'status')
        c = a.composite_status.localeCompare(b.composite_status) * dir;
      if (c !== 0) return c;
      return a.requisite_id.localeCompare(b.requisite_id);
    });

    const targetsPct = {
      fork: Number(settings.forkTrafficPercent),
      card: Number(settings.cardTrafficPercent),
      provider: Number(settings.providerTrafficPercent),
    };
    const debtPrimary =
      settings.levelPickMode === 'DEBT'
        ? pickPrimaryCascadeLevelDebt(levelCredits, targetsPct)
        : null;

    const cascade_context = {
      level_pick_mode: settings.levelPickMode,
      fork_traffic_percent: targetsPct.fork,
      card_traffic_percent: targetsPct.card,
      provider_traffic_percent: targetsPct.provider,
      autolimit_enabled: settings.autolimitEnabled,
      autolimit_threshold: Number(settings.autolimitThreshold),
      fork_credit: Math.round(levelCredits.fork * 1e6) / 1e6,
      card_credit: Math.round(levelCredits.card * 1e6) / 1e6,
      provider_credit: Math.round(levelCredits.provider * 1e6) / 1e6,
      debt_primary_preview: debtPrimary,
      redis_rank_preview_amount: payload.preview_amount,
      fill_config_fingerprint: fillFingerprint,
    };

    let trader_usdt_capacity:
      | Array<{
          trader_id: string;
          trader_label: string;
          balance_usdt: number;
          overdraft_limit_usdt: number;
          pending_payin_debit_usdt: number;
          available_usdt: number;
          capacity_exhausted: boolean;
          low_capacity: boolean;
        }>
      | undefined;

    if (enforceUsdt) {
      const { usdtBal, overdraft, pendingPayinUsdtDebit } =
        await this.getUsdtCapacityMaps(this.prisma);
      const thresholdRow = await this.platformSettings.findOne(
        PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT,
      );
      let lowThreshold = 200;
      const parsedThr = Number(thresholdRow.value);
      if (Number.isFinite(parsedThr) && parsedThr >= 0) {
        lowThreshold = parsedThr;
      }

      const traderLabels = new Map<string, string>();
      for (const r of dbReqs) {
        if (!traderLabels.has(r.traderId)) {
          traderLabels.set(r.traderId, r.trader.user.email ?? r.traderId);
        }
      }

      const traderIds = new Set<string>([
        ...traderLabels.keys(),
        ...usdtBal.keys(),
        ...overdraft.keys(),
      ]);

      trader_usdt_capacity = [...traderIds]
        .map((traderId) => {
          const balance = usdtBal.get(traderId) ?? 0;
          const od = overdraft.get(traderId) ?? 0;
          const pending = pendingPayinUsdtDebit.get(traderId) ?? 0;
          const snap = computeTraderUsdtCapacity({
            balanceUsdt: balance,
            overdraftLimitUsdt: od,
            pendingPayinDebitUsdt: pending,
            lowCapacityThresholdUsdt: lowThreshold,
          });
          return {
            trader_id: traderId,
            trader_label: traderLabels.get(traderId) ?? traderId,
            balance_usdt: Math.round(balance * 1e4) / 1e4,
            overdraft_limit_usdt: Math.round(od * 1e4) / 1e4,
            pending_payin_debit_usdt: Math.round(pending * 1e4) / 1e4,
            available_usdt: Math.round(snap.effectiveAvailableUsdt * 1e4) / 1e4,
            capacity_exhausted: snap.payinCapacityExhausted,
            low_capacity: snap.lowPayinCapacityAlert && !snap.payinCapacityExhausted,
          };
        })
        .filter((row) => row.capacity_exhausted || row.low_capacity)
        .sort((a, b) => {
          if (a.capacity_exhausted !== b.capacity_exhausted) {
            return a.capacity_exhausted ? -1 : 1;
          }
          return a.available_usdt - b.available_usdt;
        });
    }

    return {
      currency: cur,
      preview_amount: responsePreviewAmount,
      cascade_context,
      rows,
      ...(trader_usdt_capacity !== undefined ? { trader_usdt_capacity } : {}),
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

    const fillFingerprint = fillMultiplierConfigFingerprint(settings.fillMultipliersConfig);

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
      if (
        !payload ||
        payload.payload_version !== 6 ||
        payload.fill_config_fingerprint !== fillFingerprint
      ) {
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
    amount: number | undefined,
    options?: { detailed?: boolean },
  ) {
    const cur = currency.trim().toUpperCase();
    const settings = await this.getSettings();
    const fillTiersExplain = parseFillMultiplierTiersJson(settings.fillMultipliersConfig);
    const fillFingerprint = fillMultiplierConfigFingerprint(settings.fillMultipliersConfig);
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

    let payload = await this.redisState.getPayload(cur);
    if (
      !payload ||
      payload.payload_version !== 6 ||
      payload.fill_config_fingerprint !== fillFingerprint
    ) {
      payload = await this.buildCurrencyPayload(this.prisma, cur);
      await this.redisState.setPayload(cur, payload);
    }
    const strip = (s: CascadeStoredSnapshot): ReqSnapshot => {
      const { redis_meta: _rm, ...rest } = s;
      return rest;
    };
    const reqRows = payload.snapshots.map(strip);

    const explainAllNominals = amount === undefined;
    const singleEvalAmount = explainAllNominals ? 0 : amount!;
    const amountSource: 'requested' | 'all_nominals' = explainAllNominals
      ? 'all_nominals'
      : 'requested';
    const responseAmount: number | null = explainAllNominals ? null : amount!;

    const currencyRow = await this.prisma.currency.findUnique({
      where: { code: cur },
      select: { id: true },
    });
    if (!currencyRow) {
      throw new Error(`currency not found: ${cur}`);
    }
    const debtRow = await this.prisma.cascadeLevelDebt.findUnique({
      where: { currencyId: currencyRow.id },
    });
    const levelCredits = debtRow
      ? {
          fork: Number(debtRow.forkCredit),
          card: Number(debtRow.cardCredit),
          provider: Number(debtRow.providerCredit),
        }
      : { fork: 0, card: 0, provider: 0 };
    const explainNowMs = Date.now();

    const previewOrdered = await this.buildOrderedRequisiteIdsForAmount(this.prisma, {
      currency: cur,
      currencyId: currencyRow.id,
      amount: singleEvalAmount,
      anyNominal: explainAllNominals,
      parserRate,
      enforceUsdtCapacity: enforceUsdt,
      settings,
      nominalAmounts,
      reqRows,
      levelCredits,
      nowMs: explainNowMs,
    });

    // Hydrate ranks with trader/requisite labels so the UI can render
    // queue cards without a second round-trip.
    const reqIds = previewOrdered.ordered.map((o) => o.id);
    const labelRows = reqIds.length
      ? await this.prisma.requisite.findMany({
          where: { id: { in: reqIds } },
          select: {
            id: true,
            number: true,
            trader: { select: { user: { select: { email: true } } } },
          },
        })
      : [];
    const labelById = new Map(
      labelRows.map((r) => [
        r.id,
        {
          requisite_masked: maskRequisiteNumber(r.number),
          trader_label: r.trader.user.email ?? '',
        },
      ]),
    );

    const ranked = previewOrdered.ordered.map((o, i) => ({
      rank: i + 1,
      requisite_id: o.id,
      trader_id: o.traderId,
      trader_label: labelById.get(o.id)?.trader_label ?? '',
      requisite_masked: labelById.get(o.id)?.requisite_masked ?? '',
      assignment_level: o.assignmentLevel,
      weighted_score: Math.round(o.score * 1e6) / 1e6,
    }));

    // Group ranked rows by tier preserving the cascade attempt order.
    const levelOrder = cascadeLevelAttemptOrder(previewOrdered.primaryCascadeLevel).filter(
      (l): l is 'FORK' | 'CARD' => l !== 'PROVIDER',
    );
    const tiers = levelOrder.map((level) => ({
      level,
      primary: level === previewOrdered.primaryCascadeLevel,
      ranks: ranked.filter((r) => r.assignment_level === level),
    }));

    const targetsPct = {
      fork: Number(settings.forkTrafficPercent),
      card: Number(settings.cardTrafficPercent),
      provider: Number(settings.providerTrafficPercent),
    };
    const debtPrimary =
      settings.levelPickMode === 'DEBT'
        ? pickPrimaryCascadeLevelDebt(levelCredits, targetsPct)
        : null;
    const cascade_context = {
      level_pick_mode: settings.levelPickMode,
      fork_traffic_percent: targetsPct.fork,
      card_traffic_percent: targetsPct.card,
      provider_traffic_percent: targetsPct.provider,
      autolimit_enabled: settings.autolimitEnabled,
      autolimit_threshold: Number(settings.autolimitThreshold),
      fork_credit: Math.round(levelCredits.fork * 1e6) / 1e6,
      card_credit: Math.round(levelCredits.card * 1e6) / 1e6,
      provider_credit: Math.round(levelCredits.provider * 1e6) / 1e6,
      debt_primary_preview: debtPrimary,
      redis_rank_preview_amount: payload.preview_amount,
      fill_config_fingerprint: fillFingerprint,
    };

    const base = {
      currency: cur,
      amount: responseAmount,
      amount_source: amountSource,
      primary_cascade_level: previewOrdered.primaryCascadeLevel,
      cascade_context,
      tiers,
      ranks: ranked,
    };

    if (!options?.detailed) {
      return base;
    }

    const { usdtBal, overdraft, pendingPayinUsdtDebit } = await this.getUsdtCapacityMaps(this.prisma);
    const snapshots = reqRows.filter((row) => {
      const remAmt = roundMoney2(Number(row.limitTotalAmount) - Number(row.usedAmount));
      if (explainAllNominals) return remAmt > MONEY_COMPARE_EPS;
      return remAmt >= roundMoney2(singleEvalAmount) - MONEY_COMPARE_EPS;
    });
    const explainIdleMsById = await this.fetchRequisiteIdleMsFromDb(this.prisma, [
      ...new Set(reqRows.map((r) => r.id)),
    ]);
    const occupiedByRequisiteId = await this.getOccupiedPayInAmountsByRequisiteId(
      this.prisma,
      reqRows.map((r) => r.id),
    );
    const orderedIds = new Set(previewOrdered.ordered.map((o) => o.id));

    const allLabelRows = await this.prisma.requisite.findMany({
      where: { id: { in: reqRows.map((r) => r.id) } },
      select: {
        id: true,
        number: true,
        trader: { select: { user: { select: { email: true } } } },
      },
    });
    const allLabelById = new Map(
      allLabelRows.map((r) => [
        r.id,
        {
          requisite_masked: maskRequisiteNumber(r.number),
          trader_label: r.trader.user.email ?? '',
        },
      ]),
    );

    const excluded: Array<{
      requisite_id: string;
      trader_id: string;
      trader_label: string;
      requisite_masked: string;
      processing_method: string;
      code: string;
      detail: string;
    }> = [];

    for (const row of reqRows) {
      const lim = Number(row.limitTotalAmount);
      const ua = Number(row.usedAmount);
      const remAmt = lim - ua;
      const lbl = allLabelById.get(row.id);
      const baseLbl = {
        requisite_id: row.id,
        trader_id: row.traderId,
        trader_label: lbl?.trader_label ?? '',
        requisite_masked: lbl?.requisite_masked ?? '',
        processing_method: row.processingMethod,
      };
      if (
        !explainAllNominals &&
        remAmt < roundMoney2(singleEvalAmount) - MONEY_COMPARE_EPS
      ) {
        excluded.push({
          ...baseLbl,
          code: 'INSUFFICIENT_AMOUNT_HEADROOM',
          detail: `Remaining amount ${remAmt.toFixed(2)} is less than order ${singleEvalAmount}.`,
        });
        continue;
      }
      if (explainAllNominals && remAmt <= MONEY_COMPARE_EPS) {
        excluded.push({
          ...baseLbl,
          code: 'INSUFFICIENT_AMOUNT_HEADROOM',
          detail: 'No remaining headroom for any Pay-In amount.',
        });
        continue;
      }

      const tier: 'FORK' | 'CARD' =
        row.processingMethod === 'FORK' ? 'FORK' : 'CARD';
      const ev = this.evaluateSnapshotForPayInAmount(
        row,
        singleEvalAmount,
        snapshots,
        nominalAmounts,
        settings,
        usdtBal,
        overdraft,
        pendingPayinUsdtDebit,
        parserRate,
        enforceUsdt,
        explainNowMs,
        tier,
        fillTiersExplain,
        explainIdleMsById,
        explainAllNominals,
        occupiedByRequisiteId.get(row.id) ?? [],
        occupiedByRequisiteId,
      );
      if (!ev.ok) {
        excluded.push({ ...baseLbl, code: ev.code, detail: ev.detail });
      } else if (!orderedIds.has(row.id)) {
        excluded.push({
          ...baseLbl,
          code: 'LOWER_CASCADE_ORDER',
          detail:
            'Passes checks but ranks after higher-priority candidates in method-level idle-time cascade ordering.',
        });
      }
    }

    return { ...base, excluded };
  }

  async updateSettings(
    data: {
      autolimitThreshold?: number;
      autolimitEnabled?: boolean;
      forkTrafficPercent?: number;
      cardTrafficPercent?: number;
      providerTrafficPercent?: number;
      levelPickMode?: CascadeLevelPickMode;
      /** JSON array of `{ from, to, multiplier }` — Fork fill ladder (TZ §7.3); null clears to code defaults. */
      fillMultipliersConfig?: unknown | null;
    },
    updatedById: string,
  ) {
    const row = await this.getSettings();

    let forkTrafficPercent: Prisma.Decimal | undefined;
    let cardTrafficPercent: Prisma.Decimal | undefined;
    let providerTrafficPercent: Prisma.Decimal | undefined;
    if (
      data.forkTrafficPercent !== undefined ||
      data.cardTrafficPercent !== undefined ||
      data.providerTrafficPercent !== undefined
    ) {
      const n = normalizeCascadeMethodPercents({
        fork: data.forkTrafficPercent ?? Number(row.forkTrafficPercent),
        card: data.cardTrafficPercent ?? Number(row.cardTrafficPercent),
        provider: data.providerTrafficPercent ?? Number(row.providerTrafficPercent),
      });
      const integration = await this.platformSettings.findOne(
        PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
      );
      if (n.provider > 1e-9 && integration.value.trim().toLowerCase() !== 'true') {
        throw new BadRequestException(
          'PROVIDER_TRAFFIC_REQUIRES_INTEGRATION: Enable pay-in provider integration before allocating provider traffic.',
        );
      }
      forkTrafficPercent = new Prisma.Decimal(n.fork.toFixed(4));
      cardTrafficPercent = new Prisma.Decimal(n.card.toFixed(4));
      providerTrafficPercent = new Prisma.Decimal(n.provider.toFixed(4));
    }

    let fillMultipliersPersist:
      | Prisma.NullableJsonNullValueInput
      | Prisma.InputJsonValue
      | undefined;
    if (data.fillMultipliersConfig !== undefined) {
      if (data.fillMultipliersConfig === null) {
        fillMultipliersPersist = Prisma.JsonNull;
      } else {
        const parsed = parseFillMultiplierTiersJson(data.fillMultipliersConfig);
        if (parsed === null) {
          throw new BadRequestException(
            'INVALID_FILL_MULTIPLIERS_CONFIG: Expected a JSON array of { from, to, multiplier } with 0 <= from < to <= 1.',
          );
        }
        fillMultipliersPersist = data.fillMultipliersConfig as Prisma.InputJsonValue;
      }
    }

    return this.prisma.cascadeSetting.update({
      where: { id: row.id },
      data: {
        ...(data.autolimitThreshold !== undefined
          ? { autolimitThreshold: new Prisma.Decimal(data.autolimitThreshold) }
          : {}),
        ...(data.autolimitEnabled !== undefined
          ? { autolimitEnabled: data.autolimitEnabled }
          : {}),
        ...(forkTrafficPercent !== undefined ? { forkTrafficPercent } : {}),
        ...(cardTrafficPercent !== undefined ? { cardTrafficPercent } : {}),
        ...(providerTrafficPercent !== undefined ? { providerTrafficPercent } : {}),
        ...(data.levelPickMode !== undefined ? { levelPickMode: data.levelPickMode } : {}),
        ...(fillMultipliersPersist !== undefined ? { fillMultipliersConfig: fillMultipliersPersist } : {}),
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

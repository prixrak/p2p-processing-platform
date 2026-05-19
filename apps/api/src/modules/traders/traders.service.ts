import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { BalanceTransactionType, PayinStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import type { GetStatisticsDto } from './dto/get-statistics.dto';
import { resolveStatisticsWindow } from '../../common/utils/statistics-window';
import { resolveTraderStatisticsCurrency } from './trader-statistics-currency';
import { enumerateDaysUTC, statusRecordToLowercase } from '../../common/utils/stats.util';
import type { UpdateTraderBalanceModelDto } from './dto/update-trader-balance-model.dto';
import type { UpdateTraderCascadeDto } from './dto/update-trader-cascade.dto';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import { PlatformSettingsService, PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT } from '../platform-settings/platform-settings.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { PayinService } from '../payin/payin.service';
import { PayoutService } from '../payout/payout.service';
import {
  CASCADE_METHOD_LEVEL_ASSIGNMENT_NOTE,
  CASCADE_METHOD_LEVEL_POLICY_TEXT,
  type CascadeMethodPolicySummary,
} from './cascade-traffic-percent-policy';
import type { TraderCabinetAnalyticsQueryDto } from './dto/trader-cabinet-analytics-query.dto';
import {
  alignBucketStartUtc,
  enumerateBucketStartsUtc,
  type TraderCabinetAnalyticsGranularity,
} from './trader-cabinet-analytics.util';
import {
  computeTraderUsdtCapacity,
  PAYIN_PRE_USDT_SETTLEMENT_STATUSES,
} from '@p2p/shared';

/** Tron base58check addresses are 34 chars and start with T. */
export function isValidTronTrc20Address(addr: string): boolean {
  const s = addr.trim();
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
}

/** Ethereum checksummed or lowercase hex address (USDT ERC-20 deposit path). */
export function isValidEthereumUsdtDepositAddress(addr: string): boolean {
  const s = addr.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

const TRAFFIC_SUM_EPS = 0.02;

@Injectable()
export class TradersService {
  private readonly logger = new Logger(TradersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly cascadeCoverageCache: CascadeRedisStateService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly currencies: CurrenciesService,
    private readonly payinService: PayinService,
    private readonly payoutService: PayoutService,
  ) {}

  /**
   * Snapshot for dashboards and PATCH metadata: same cohort as PATCH validation
   * (`isActive` && `acceptingOrders`).
   */
  async getCascadeMethodPolicySummary(): Promise<CascadeMethodPolicySummary> {
    const s = await this.prisma.cascadeSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!s) {
      throw new Error('cascade_settings row missing');
    }
    const fork = Number(s.forkTrafficPercent);
    const card = Number(s.cardTrafficPercent);
    const provider = Number(s.providerTrafficPercent);
    const sum = fork + card + provider;
    const forkCardSum = fork + card;
    return {
      fork_traffic_percent: round4(fork),
      card_traffic_percent: round4(card),
      provider_traffic_percent: round4(provider),
      method_share_sum_percent: round4(sum),
      matches_rule: Math.abs(sum - 100) <= TRAFFIC_SUM_EPS,
      fork_card_sum_percent: round4(forkCardSum),
      fork_card_split_matches_spec: Math.abs(forkCardSum - 100) <= TRAFFIC_SUM_EPS,
      policy: CASCADE_METHOD_LEVEL_POLICY_TEXT,
      assignment_note: CASCADE_METHOD_LEVEL_ASSIGNMENT_NOTE,
    };
  }

  /** Invalidates cascade Redis snapshots after cascade-routing-related profile updates. */
  invalidateCascadeCoverageCaches(): void {
    void this.cascadeCoverageCache.invalidateAll();
  }

  async getProfile(traderId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        balances: { include: { currency: { select: { code: true } } } },
        requisites: {
          include: { bank: { select: { name: true } }, group: true },
          orderBy: { createdAt: 'desc' },
        },
        telegramSettings: true,
      },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }
    return trader;
  }

  async getProfileByUserId(userId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        balances: { include: { currency: { select: { code: true } } } },
        requisites: { where: { isActive: true } },
        telegramSettings: true,
      },
    });
    if (!trader) {
      throw new NotFoundException(`Trader profile for user ${userId} not found`);
    }
    return trader;
  }

  async getBalances(traderId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    return this.prisma.traderBalance.findMany({
      where: { traderId },
      include: { currency: { select: { code: true } } },
    });
  }

  async getStatistics(traderId: string, query: GetStatisticsDto) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    const window = resolveStatisticsWindow(query);
    const currency = await resolveTraderStatisticsCurrency(
      this.prisma,
      traderId,
      window,
      query.currency,
    );
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(currency);

    const dateWhere = {
      gte: window.from,
      lte: window.to,
    };

    const basePayin = { traderId, currencyId, createdAt: dateWhere };
    const basePayout = { traderId, currencyId, createdAt: dateWhere };

    const [
      payinTotal,
      payoutTotal,
      payinPaidSum,
      payoutCompletedSum,
      payinPaidCount,
      payoutCompletedCount,
      payinCanceledCount,
      payoutFailedCount,
      payinGroup,
      payoutGroup,
      payinByDay,
      payoutByDay,
    ] = await Promise.all([
      this.prisma.payinOrder.count({ where: basePayin }),
      this.prisma.payoutOrder.count({ where: basePayout }),
      this.prisma.payinOrder.aggregate({
        where: { ...basePayin, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payoutOrder.aggregate({
        where: { ...basePayout, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.count({
        where: { ...basePayin, status: 'PAID' },
      }),
      this.prisma.payoutOrder.count({
        where: { ...basePayout, status: 'COMPLETED' },
      }),
      this.prisma.payinOrder.count({
        where: { ...basePayin, status: 'CANCELED' },
      }),
      this.prisma.payoutOrder.count({
        where: {
          ...basePayout,
          status: { in: ['FAILED', 'UPLOAD_FAILED'] },
        },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['status'],
        where: basePayin,
        _count: { _all: true },
      }),
      this.prisma.payoutOrder.groupBy({
        by: ['status'],
        where: basePayout,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; volume: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
                 COALESCE(SUM(amount), 0) AS volume
          FROM payin_orders po
          INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
          WHERE po.trader_id = ${traderId}::uuid
            AND po.status = 'PAID'
            AND po.created_at >= ${window.from}
            AND po.created_at <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
      this.prisma.$queryRaw<Array<{ day: Date; volume: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
                 COALESCE(SUM(amount), 0) AS volume
          FROM payout_orders po
          INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
          WHERE po.trader_id = ${traderId}::uuid
            AND po.status = 'COMPLETED'
            AND po.created_at >= ${window.from}
            AND po.created_at <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
    ]);

    const totalOrders = payinTotal + payoutTotal;
    const successfulOrders = payinPaidCount + payoutCompletedCount;
    const canceledOrders = payinCanceledCount + payoutFailedCount;
    const totalVolume =
      Number(payinPaidSum._sum.amount ?? 0) + Number(payoutCompletedSum._sum.amount ?? 0);
    const conversionRate =
      totalOrders > 0 ? (successfulOrders / totalOrders) * 100 : 0;

    const payinVolMap = new Map<string, number>();
    for (const row of payinByDay) {
      const key = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);
      payinVolMap.set(key, Number(row.volume));
    }
    const payoutVolMap = new Map<string, number>();
    for (const row of payoutByDay) {
      const key = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);
      payoutVolMap.set(key, Number(row.volume));
    }

    const dayKeys = enumerateDaysUTC(window.from, window.to);
    const volumeByDay = dayKeys.map((date) => {
      const payinVolume = payinVolMap.get(date) ?? 0;
      const payoutVolume = payoutVolMap.get(date) ?? 0;
      return {
        date,
        payinVolume,
        payoutVolume,
        totalVolume: payinVolume + payoutVolume,
      };
    });

    return {
      traderId,
      currency,
      period: window.period,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      totalVolume,
      totalOrders,
      successfulOrders,
      canceledOrders,
      conversionRate,
      volumeByDay,
      ordersByStatus: {
        payIn: statusRecordToLowercase(payinGroup),
        payout: statusRecordToLowercase(payoutGroup),
      },
    };
  }

  /** UTC wall-time truncation (PostgreSQL DATE_TRUNC semantics for timestamptz). */
  private dateTruncUtc(bucket: TraderCabinetAnalyticsGranularity, tsExpr: Prisma.Sql): Prisma.Sql {
    const unit =
      bucket === 'hour'
        ? Prisma.sql`'hour'`
        : bucket === 'day'
          ? Prisma.sql`'day'`
          : bucket === 'week'
            ? Prisma.sql`'week'`
            : Prisma.sql`'month'`;
    return Prisma.sql`DATE_TRUNC(${unit}, (${tsExpr}) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
  }

  /**
   * Cabinet analytics for Pay-In / Pay-Out / disputes with bucketed series.
   *
   * Risk note: `dateBasis=completed` uses completion proxies when timestamps are absent
   * (Pay-In: `completed_at ?? updated_at`, Pay-Out: `end_at ?? updated_at`; disputes resolved use `updated_at`).
   */
  async getCabinetAnalytics(traderId: string, query: TraderCabinetAnalyticsQueryDto) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      select: { id: true },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    const window = resolveStatisticsWindow(query);
    const granularity: TraderCabinetAnalyticsGranularity = query.granularity ?? 'day';
    const dateBasis = query.dateBasis ?? 'created';

    const currency = await resolveTraderStatisticsCurrency(
      this.prisma,
      traderId,
      window,
      query.currency,
    );

    const payinTs =
      dateBasis === 'created'
        ? Prisma.sql`po.created_at`
        : Prisma.sql`COALESCE(po.completed_at, po.updated_at)`;

    const payoutTs =
      dateBasis === 'created'
        ? Prisma.sql`po.created_at`
        : Prisma.sql`COALESCE(po.end_at, po.updated_at)`;

    const bucketExpr = this.dateTruncUtc(granularity, payinTs);
    const payoutBucketExpr = this.dateTruncUtc(granularity, payoutTs);

    const appealTs =
      dateBasis === 'created'
        ? Prisma.sql`a.created_at`
        : Prisma.sql`a.updated_at`;
    const appealBucketExpr = this.dateTruncUtc(granularity, appealTs);

    const appealExtraWhere =
      dateBasis === 'completed'
        ? Prisma.sql`AND a.status IN ('RESOLVED', 'REJECTED')`
        : Prisma.empty;

    const [
      profitRow,
      payinBuckets,
      payoutBuckets,
      appealBuckets,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ payinProfit: unknown; payoutProfit: unknown }>>(
        Prisma.sql`
          SELECT
            COALESCE((SELECT SUM(po.commission)::float
              FROM payin_orders po
              INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
              WHERE po.trader_id = ${traderId}::uuid
                AND po.status = 'PAID'
                AND ${payinTs} >= ${window.from}
                AND ${payinTs} <= ${window.to}), 0) AS "payinProfit",
            COALESCE((SELECT SUM(po.commission_amount)::float
              FROM payout_orders po
              INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
              WHERE po.trader_id = ${traderId}::uuid
                AND po.status = 'COMPLETED'
                AND ${payoutTs} >= ${window.from}
                AND ${payoutTs} <= ${window.to}), 0) AS "payoutProfit"
        `,
      ),
      this.prisma.$queryRaw<
        Array<{
          bucket_ts: Date;
          cnt: number;
          amt: unknown;
          profit: unknown;
        }>
      >(
        Prisma.sql`
          SELECT ${bucketExpr} AS bucket_ts,
                 COUNT(*)::int AS cnt,
                 COALESCE(SUM(po.amount), 0)::float AS amt,
                 COALESCE(SUM(po.commission), 0)::float AS profit
          FROM payin_orders po
          INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
          WHERE po.trader_id = ${traderId}::uuid
            AND po.status = 'PAID'
            AND ${payinTs} >= ${window.from}
            AND ${payinTs} <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
      this.prisma.$queryRaw<
        Array<{
          bucket_ts: Date;
          cnt: number;
          amt: unknown;
          profit: unknown;
        }>
      >(
        Prisma.sql`
          SELECT ${payoutBucketExpr} AS bucket_ts,
                 COUNT(*)::int AS cnt,
                 COALESCE(SUM(po.amount), 0)::float AS amt,
                 COALESCE(SUM(po.commission_amount), 0)::float AS profit
          FROM payout_orders po
          INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
          WHERE po.trader_id = ${traderId}::uuid
            AND po.status = 'COMPLETED'
            AND ${payoutTs} >= ${window.from}
            AND ${payoutTs} <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
      this.prisma.$queryRaw<Array<{ bucket_ts: Date; cnt: number; amt: unknown }>>(
        Prisma.sql`
          SELECT ${appealBucketExpr} AS bucket_ts,
                 COUNT(*)::int AS cnt,
                 COALESCE(SUM(a.paid_amount), 0)::float AS amt
          FROM appeals a
          INNER JOIN payin_orders po ON po.id = a.payin_order_id
          INNER JOIN currencies c ON c.id = po.currency_id AND c.code = ${currency}
          WHERE po.trader_id = ${traderId}::uuid
            AND ${appealTs} >= ${window.from}
            AND ${appealTs} <= ${window.to}
            ${appealExtraWhere}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
    ]);

    const pRow = profitRow[0];
    const cabinetProfitTotal =
      Number(pRow?.payinProfit ?? 0) + Number(pRow?.payoutProfit ?? 0);

    type Cell = {
      payInCount: number;
      payInAmount: number;
      payInProfit: number;
      payoutCount: number;
      payoutAmount: number;
      payoutProfit: number;
      disputeCount: number;
      disputeAmount: number;
    };

    const emptyCell = (): Cell => ({
      payInCount: 0,
      payInAmount: 0,
      payInProfit: 0,
      payoutCount: 0,
      payoutAmount: 0,
      payoutProfit: 0,
      disputeCount: 0,
      disputeAmount: 0,
    });

    const byBucket = new Map<number, Cell>();

    const normalizeKey = (d: Date) =>
      alignBucketStartUtc(d, granularity).getTime();

    const touch = (key: number) => {
      let cell = byBucket.get(key);
      if (!cell) {
        cell = emptyCell();
        byBucket.set(key, cell);
      }
      return cell;
    };

    for (const r of payinBuckets) {
      const k = normalizeKey(r.bucket_ts);
      const c = touch(k);
      c.payInCount += r.cnt;
      c.payInAmount += Number(r.amt ?? 0);
      c.payInProfit += Number(r.profit ?? 0);
    }

    for (const r of payoutBuckets) {
      const k = normalizeKey(r.bucket_ts);
      const c = touch(k);
      c.payoutCount += r.cnt;
      c.payoutAmount += Number(r.amt ?? 0);
      c.payoutProfit += Number(r.profit ?? 0);
    }

    for (const r of appealBuckets) {
      const k = normalizeKey(r.bucket_ts);
      const c = touch(k);
      c.disputeCount += r.cnt;
      c.disputeAmount += Number(r.amt ?? 0);
    }

    const enumerated = enumerateBucketStartsUtc(window.from, window.to, granularity);
    const series = [...enumerated].reverse().map((b) => {
      const ms = b.getTime();
      const cell = byBucket.get(ms) ?? emptyCell();
      const profitAmount = cell.payInProfit + cell.payoutProfit;
      return {
        periodStart: b.toISOString(),
        payInCount: cell.payInCount,
        payInAmount: cell.payInAmount,
        payoutCount: cell.payoutCount,
        payoutAmount: cell.payoutAmount,
        disputeCount: cell.disputeCount,
        disputeAmount: cell.disputeAmount,
        profitAmount,
      };
    });

    return {
      traderId,
      currency,
      granularity,
      dateBasis,
      period: window.period,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      cabinetProfitTotal,
      series,
    };
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [traders, total] = await Promise.all([
      this.prisma.traderProfile.findMany({
        skip,
        take: limit,
        include: {
          user: { select: { email: true, role: true, isActive: true } },
          balances: { include: { currency: { select: { code: true } } } },
          _count: {
            select: {
              payinOrders: true,
              payoutOrders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.traderProfile.count(),
    ]);

    const traderIds = traders.map((t) => t.id);
    const volumeAggs = traderIds.length
      ? await Promise.all(
          traderIds.map((id) =>
            Promise.all([
              this.prisma.payinOrder.aggregate({
                where: { traderId: id, status: 'PAID' },
                _sum: { amount: true },
              }),
              this.prisma.payinOrder.count({ where: { traderId: id, status: 'PAID' } }),
              this.prisma.payinOrder.count({ where: { traderId: id } }),
            ]),
          ),
        )
      : [];

    const enriched = traders.map((t, i) => {
      const [volAgg, completedPayin, totalPayin] = volumeAggs[i] ?? [null, 0, 0];
      const totalOrders = (t._count?.payinOrders ?? 0) + (t._count?.payoutOrders ?? 0);
      const successRate = totalPayin > 0 ? Math.round((completedPayin / totalPayin) * 100) : 0;
      return {
        ...t,
        ordersCount: totalOrders,
        completedOrders: completedPayin,
        totalVolume: Number(volAgg?._sum?.amount ?? 0),
        successRate,
      };
    });

    return { data: enriched, total, page, limit };
  }

  async activate(traderId: string) {
    const trader = await this.getProfile(traderId);
    if (trader.isActive) {
      throw new ConflictException('Trader is already active');
    }

    this.logger.log(`Trader activated: ${traderId}`);
    return this.prisma.traderProfile.update({
      where: { id: traderId },
      data: { isActive: true },
    });
  }

  async deactivate(traderId: string) {
    const trader = await this.getProfile(traderId);
    if (!trader.isActive) {
      throw new ConflictException('Trader is already inactive');
    }

    this.logger.warn(`Trader deactivated: ${traderId}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.traderProfile.update({
        where: { id: traderId },
        data: { isActive: false },
      });
    });

    const payinCanceled = await this.payinService.cancelOpenAssignmentsForDeactivatedTrader(traderId);
    const payoutReleased =
      await this.payoutService.releaseStandardTraderAssignmentsForDeactivatedProfile(traderId);
    if (payinCanceled > 0 || payoutReleased > 0) {
      this.logger.warn(
        `Trader ${traderId} deactivation: canceled ${payinCanceled} pay-in(s), returned ${payoutReleased} payout(s) to pool`,
      );
    }

    await this.cascadeCoverageCache.invalidateAll();

    return this.prisma.traderProfile.findUniqueOrThrow({
      where: { id: traderId },
    });
  }

  /**
   * Trader self-service: pause or resume receiving new Pay-In requisites selection and Pay-Out pool access.
   * Inactive (admin-disabled) accounts cannot change this flag.
   */
  async setAcceptingOrders(traderId: string, acceptingOrders: boolean) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }
    if (!trader.isActive) {
      throw new ForbiddenException('Your account is disabled. Contact support.');
    }

    const updated = await this.prisma.traderProfile.update({
      where: { id: traderId },
      data: { acceptingOrders },
    });

    this.logger.log(`Trader ${traderId} set accepting_orders=${acceptingOrders}`);

    return updated;
  }

  async setPayoutLimits(
    traderId: string,
    minLimit: number,
    maxLimit: number,
  ) {
    if (minLimit < 0 || maxLimit < 0) {
      throw new BadRequestException('Limits must be non-negative (0 means no limit)');
    }
    if (maxLimit > 0 && minLimit > maxLimit) {
      throw new BadRequestException('minLimit cannot be greater than maxLimit');
    }

    await this.getProfile(traderId);

    const updated = await this.prisma.traderProfile.update({
      where: { id: traderId },
      data: { payoutMinLimit: minLimit, payoutMaxLimit: maxLimit },
    });

    this.logger.log(
      `Payout limits updated for trader ${traderId}: min=${minLimit}, max=${maxLimit}`,
    );
    return updated;
  }

  /**
   * RISK NOTE: overdraft and rate parameters directly affect Pay-In assignment and settlement math (Block 5).
   */
  async updateBalanceModel(
    traderId: string,
    dto: UpdateTraderBalanceModelDto,
    actor: { id: string; role: string },
  ) {
    await this.getProfile(traderId);

    const hasField =
      dto.overdraft_limit_usdt !== undefined ||
      dto.payin_rate !== undefined ||
      dto.payout_rate !== undefined ||
      dto.usdt_trc20_deposit_address !== undefined ||
      dto.clear_trc20_deposit_address === true ||
      dto.usdt_erc20_deposit_address !== undefined ||
      dto.clear_erc20_deposit_address === true;
    if (!hasField) {
      throw new BadRequestException('No fields to update');
    }

    const prev = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      select: {
        overdraftLimit: true,
        payinRate: true,
        payoutRate: true,
        usdtTrc20DepositAddress: true,
        usdtErc20DepositAddress: true,
      },
    });

    const data: Prisma.TraderProfileUpdateInput = {};
    if (dto.overdraft_limit_usdt !== undefined) {
      data.overdraftLimit = dto.overdraft_limit_usdt;
    }
    if (dto.payin_rate !== undefined) {
      data.payinRate = dto.payin_rate;
    }
    if (dto.payout_rate !== undefined) {
      data.payoutRate = dto.payout_rate;
    }
    if (dto.clear_trc20_deposit_address) {
      data.usdtTrc20DepositAddress = null;
    } else if (dto.usdt_trc20_deposit_address !== undefined) {
      const addr = dto.usdt_trc20_deposit_address.trim();
      if (!isValidTronTrc20Address(addr)) {
        throw new BadRequestException('Invalid USDT TRC-20 (Tron) address');
      }
      const taken = await this.prisma.traderProfile.findFirst({
        where: { usdtTrc20DepositAddress: addr, NOT: { id: traderId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('This deposit address is already assigned to another trader');
      }
      data.usdtTrc20DepositAddress = addr;
    }

    if (dto.clear_erc20_deposit_address) {
      data.usdtErc20DepositAddress = null;
    } else if (dto.usdt_erc20_deposit_address !== undefined) {
      const addr = dto.usdt_erc20_deposit_address.trim();
      if (!isValidEthereumUsdtDepositAddress(addr)) {
        throw new BadRequestException('Invalid USDT ERC-20 (Ethereum) address');
      }
      const taken = await this.prisma.traderProfile.findFirst({
        where: { usdtErc20DepositAddress: addr, NOT: { id: traderId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('This ERC-20 deposit address is already assigned to another trader');
      }
      data.usdtErc20DepositAddress = addr.toLowerCase();
    }

    const prevLimit = Number(prev?.overdraftLimit ?? 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.traderProfile.update({
        where: { id: traderId },
        data,
      });

      const newLimit = Number(u.overdraftLimit);
      if (dto.overdraft_limit_usdt !== undefined && prevLimit !== newLimit) {
        await this.balanceTxService.record({
          traderId,
          type: BalanceTransactionType.OVERDRAFT_SET,
          amount: newLimit,
          currency: 'USDT',
          createdById: actor.id,
          comment: `Overdraft limit changed from ${prevLimit} to ${newLimit} USDT`,
          tx,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'trader_balance_model_update',
          entityType: 'TraderProfile',
          entityId: traderId,
          oldValue: (prev ?? {}) as unknown as Prisma.InputJsonValue,
          newValue: {
            overdraftLimit: u.overdraftLimit.toString(),
            payinRate: u.payinRate.toString(),
            payoutRate: u.payoutRate.toString(),
            usdtTrc20DepositAddress: u.usdtTrc20DepositAddress,
            usdtErc20DepositAddress: u.usdtErc20DepositAddress,
          },
        },
      });

      return u;
    });

    this.logger.log(`Trader ${traderId} balance model updated by ${actor.id}`);
    return updated;
  }

  /**
   * Block 5 §4.4 — USDT capacity for Pay-In assignment and cabinet display.
   */
  async getUsdtWalletSummaryForUser(userId: string) {
    const profile = await this.prisma.traderProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        overdraftLimit: true,
        usdtTrc20DepositAddress: true,
        usdtErc20DepositAddress: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Trader profile not found');
    }

    const usdtId = await this.currencies.getUsdtCurrencyId();
    const row = await this.prisma.traderBalance.findUnique({
      where: {
        traderId_currencyId: { traderId: profile.id, currencyId: usdtId },
      },
      select: { amount: true },
    });

    const balanceUsdt = Number(row?.amount ?? 0);
    const overdraftLimit = Number(profile.overdraftLimit ?? 0);
    const displayOwnUsdt = Math.max(0, balanceUsdt);

    const pendingRows = await this.prisma.payinOrder.findMany({
      where: {
        traderId: profile.id,
        status: {
          in: PAYIN_PRE_USDT_SETTLEMENT_STATUSES.map((s) => s as unknown as PayinStatus),
        },
        rateTraderIn: { not: null },
        currency: { code: 'UAH' },
      },
      select: { amount: true, rateTraderIn: true },
    });
    let pendingPayinDebitUsdt = 0;
    for (const o of pendingRows) {
      const fiat = Number(o.amount);
      const rt = Number(o.rateTraderIn);
      if (!(fiat > 0) || !(rt > 0) || !Number.isFinite(fiat) || !Number.isFinite(rt)) {
        continue;
      }
      pendingPayinDebitUsdt += fiat / rt;
    }
    pendingPayinDebitUsdt = round4(pendingPayinDebitUsdt);

    const thresholdRow = await this.platformSettings.findOne(
      PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT,
    );
    let payin_low_capacity_alert_threshold_usdt = 200;
    const parsedThr = Number(thresholdRow.value);
    if (Number.isFinite(parsedThr) && parsedThr >= 0) {
      payin_low_capacity_alert_threshold_usdt = parsedThr;
    }

    const capacity = computeTraderUsdtCapacity({
      balanceUsdt,
      overdraftLimitUsdt: overdraftLimit,
      pendingPayinDebitUsdt,
      lowCapacityThresholdUsdt: payin_low_capacity_alert_threshold_usdt,
    });

    return {
      trader_id: profile.id,
      balance_usdt: balanceUsdt,
      overdraft_limit_usdt: overdraftLimit,
      display_own_usdt: displayOwnUsdt,
      available_for_payin_usdt: capacity.grossAvailableUsdt,
      pending_payin_usdt_debit_usdt: capacity.pendingPayinDebitUsdt,
      effective_available_for_payin_usdt: capacity.effectiveAvailableUsdt,
      payin_low_capacity_alert_threshold_usdt,
      low_payin_capacity_alert: capacity.lowPayinCapacityAlert,
      payin_capacity_exhausted: capacity.payinCapacityExhausted,
      work_mode: overdraftLimit > 0 ? 'OVERDRAFT' : 'BALANCE',
      usdt_trc20_deposit_address: profile.usdtTrc20DepositAddress,
      usdt_erc20_deposit_address: profile.usdtErc20DepositAddress,
    };
  }

  /**
   * Pay-In cascade: CARD vs FORK (Fork autolimits) and idle-race multiplier (TZ v3.1).
   */
  async updateCascadeRouting(
    traderId: string,
    dto: UpdateTraderCascadeDto,
    actor: { id: string; role: string },
  ) {
    await this.getProfile(traderId);
    const has =
      dto.processing_method !== undefined || dto.cascade_rating_multiplier !== undefined;
    if (!has) {
      throw new BadRequestException('No fields to update');
    }

    const prev = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      select: { processingMethod: true, cascadeRatingMultiplier: true },
    });

    const data: Prisma.TraderProfileUpdateInput = {};
    if (dto.processing_method !== undefined) {
      data.processingMethod = dto.processing_method;
    }
    if (dto.cascade_rating_multiplier !== undefined) {
      data.cascadeRatingMultiplier = new Prisma.Decimal(
        dto.cascade_rating_multiplier.toFixed(6),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.traderProfile.update({
        where: { id: traderId },
        data,
      });

      const u = await tx.traderProfile.findUniqueOrThrow({
        where: { id: traderId },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'trader_cascade_routing_update',
          entityType: 'TraderProfile',
          entityId: traderId,
          oldValue: (prev ?? {}) as unknown as Prisma.InputJsonValue,
          newValue: {
            processingMethod: u.processingMethod,
            cascadeRatingMultiplier: u.cascadeRatingMultiplier.toString(),
          },
        },
      });

      return u;
    });

    this.logger.log(`Trader ${traderId} cascade routing updated by ${actor.id}`);
    void this.cascadeCoverageCache.invalidateAll();

    const method_policy = await this.getCascadeMethodPolicySummary();
    return { ...updated, _meta: { method_policy } };
  }
}

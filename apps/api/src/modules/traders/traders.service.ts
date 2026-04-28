import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import { resolveStatisticsWindow } from '../../common/utils/statistics-window';

function enumerateDaysUTC(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function statusRecordToLowercase(
  rows: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const r: Record<string, number> = {};
  for (const row of rows) {
    r[row.status.toLowerCase()] = row._count._all;
  }
  return r;
}

@Injectable()
export class TradersService {
  private readonly logger = new Logger(TradersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async pickDisplayCurrency(traderId: string): Promise<string> {
    const balances = await this.prisma.traderBalance.findMany({
      where: { traderId },
      orderBy: { currency: 'asc' },
      take: 1,
    });
    if (balances.length > 0) {
      return balances[0].currency;
    }
    return 'UAH';
  }

  async getProfile(traderId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        balances: true,
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
        balances: true,
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
    });
  }

  async getStatistics(traderId: string, query: StatisticsQueryDto) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    const window = resolveStatisticsWindow(query);
    const currency = await this.pickDisplayCurrency(traderId);

    const dateWhere = {
      gte: window.from,
      lte: window.to,
    };

    const basePayin = { traderId, currency, createdAt: dateWhere };
    const basePayout = { traderId, currency, createdAt: dateWhere };

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
          FROM payin_orders
          WHERE trader_id = ${traderId}::uuid
            AND currency = ${currency}
            AND status = 'PAID'
            AND created_at >= ${window.from}
            AND created_at <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
      this.prisma.$queryRaw<Array<{ day: Date; volume: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
                 COALESCE(SUM(amount), 0) AS volume
          FROM payout_orders
          WHERE trader_id = ${traderId}::uuid
            AND currency = ${currency}
            AND status = 'COMPLETED'
            AND created_at >= ${window.from}
            AND created_at <= ${window.to}
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

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [traders, total] = await Promise.all([
      this.prisma.traderProfile.findMany({
        skip,
        take: limit,
        include: {
          user: { select: { email: true, role: true, isActive: true } },
          balances: true,
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
    return this.prisma.traderProfile.update({
      where: { id: traderId },
      data: { isActive: false },
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
}

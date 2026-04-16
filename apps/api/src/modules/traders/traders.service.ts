import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class TradersService {
  private readonly logger = new Logger(TradersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(traderId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        balances: true,
        requisites: { include: { bank: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
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

  async getStatistics(
    traderId: string,
    dateRange?: { dateFrom?: string; dateTo?: string },
  ) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
    if (dateRange?.dateFrom || dateRange?.dateTo) {
      dateFilter.createdAt = {};
      if (dateRange.dateFrom) {
        dateFilter.createdAt.gte = new Date(dateRange.dateFrom);
      }
      if (dateRange.dateTo) {
        dateFilter.createdAt.lte = new Date(dateRange.dateTo);
      }
    }

    const [payinOrders, payoutOrders, totalPayins, totalPayouts] =
      await Promise.all([
        this.prisma.payinOrder.count({
          where: { traderId, ...dateFilter },
        }),
        this.prisma.payoutOrder.count({
          where: { traderId, ...dateFilter },
        }),
        this.prisma.payinOrder.aggregate({
          where: {
            traderId,
            status: 'PAID',
            ...dateFilter,
          },
          _sum: { amount: true },
        }),
        this.prisma.payoutOrder.aggregate({
          where: {
            traderId,
            status: 'COMPLETED',
            ...dateFilter,
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      traderId,
      payinOrdersCount: payinOrders,
      payoutOrdersCount: payoutOrders,
      totalPayinAmount: totalPayins._sum.amount ?? 0,
      totalPayoutAmount: totalPayouts._sum.amount ?? 0,
      dateFrom: dateRange?.dateFrom ?? null,
      dateTo: dateRange?.dateTo ?? null,
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

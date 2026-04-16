import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide stats' })
  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalMerchants,
      activeTraders,
      ordersToday,
      totalPayinVolume,
      totalPayoutVolume,
      payinCommissionAgg,
      payoutCommissionAgg,
      successfulOrders,
      totalOrders,
      activePayins,
      activePayouts,
      pendingSettlements,
      disputesCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.merchant.count(),
      this.prisma.traderProfile.count({ where: { isActive: true } }),
      this.prisma.payinOrder.count({ where: { createdAt: { gte: today } } }),
      this.prisma.payinOrder.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payoutOrder.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.aggregate({
        where: { status: 'PAID' },
        _sum: { commission: true },
      }),
      this.prisma.payoutOrder.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { commissionAmount: true },
      }),
      this.prisma.payinOrder.count({
        where: { status: 'PAID' },
      }),
      this.prisma.payinOrder.count(),
      this.prisma.payinOrder.count({
        where: { status: { in: ['PENDING', 'NEW', 'VERIFIED'] } },
      }),
      this.prisma.payoutOrder.count({
        where: { status: { in: ['PENDING', 'NEW', 'PROCESSING'] } },
      }),
      this.prisma.settlement.count({ where: { createdAt: { gte: today } } }),
      this.prisma.appeal.count({ where: { status: 'OPEN' } }),
    ]);

    const totalVolume =
      Number(totalPayinVolume._sum.amount ?? 0) +
      Number(totalPayoutVolume._sum.amount ?? 0);

    const conversionRate =
      totalOrders > 0 ? (successfulOrders / totalOrders) * 100 : 0;

    const totalCommissions =
      Number(payinCommissionAgg._sum.commission ?? 0) +
      Number(payoutCommissionAgg._sum.commissionAmount ?? 0);

    return {
      totalUsers,
      totalMerchants,
      activeTraders,
      ordersToday,
      totalVolume,
      totalOrders,
      conversionRate,
      totalCommissions,
      activePayins,
      activePayouts,
      pendingSettlements,
      disputesCount,
    };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get detailed platform statistics with period filtering' })
  @ApiQuery({ name: 'period', required: false, enum: ['24h', '7d', '30d', '90d'] })
  async getStatistics(@Query('period') period = '7d') {
    const now = new Date();
    const periodMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = periodMap[period] ?? 7;
    const from = new Date(now);
    from.setDate(from.getDate() - days);

    const [
      payinVolumeAgg,
      payoutVolumeAgg,
      payinCommissionAgg,
      payoutCommissionAgg,
      totalPayinOrders,
      completedPayinOrders,
      totalPayoutOrders,
      completedPayoutOrders,
      activeTraders,
      ordersByStatusRaw,
      topMerchantsRaw,
      topTradersRaw,
    ] = await Promise.all([
      this.prisma.payinOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: from } },
        _sum: { amount: true },
      }),
      this.prisma.payoutOrder.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: from } },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: from } },
        _sum: { commission: true },
      }),
      this.prisma.payoutOrder.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: from } },
        _sum: { commissionAmount: true },
      }),
      this.prisma.payinOrder.count({ where: { createdAt: { gte: from } } }),
      this.prisma.payinOrder.count({ where: { status: 'PAID', createdAt: { gte: from } } }),
      this.prisma.payoutOrder.count({ where: { createdAt: { gte: from } } }),
      this.prisma.payoutOrder.count({ where: { status: 'COMPLETED', createdAt: { gte: from } } }),
      this.prisma.traderProfile.count({ where: { isActive: true } }),
      this.prisma.payinOrder.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['merchantId'],
        where: { status: 'PAID', createdAt: { gte: from } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      this.prisma.payinOrder.groupBy({
        by: ['traderId'],
        where: { traderId: { not: null }, createdAt: { gte: from } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    const payinVolume = Number(payinVolumeAgg._sum.amount ?? 0);
    const payoutVolume = Number(payoutVolumeAgg._sum.amount ?? 0);
    const totalVolume = payinVolume + payoutVolume;
    const totalOrders = totalPayinOrders + totalPayoutOrders;
    const completedOrders = completedPayinOrders + completedPayoutOrders;
    const conversionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    const avgOrderAmount = completedOrders > 0 ? totalVolume / completedOrders : 0;

    const totalCommissions =
      Number(payinCommissionAgg._sum.commission ?? 0) +
      Number(payoutCommissionAgg._sum.commissionAmount ?? 0);

    const ordersByStatus: Record<string, number> = {};
    for (const row of ordersByStatusRaw) {
      ordersByStatus[row.status.toLowerCase()] = row._count._all;
    }

    const merchantIds = topMerchantsRaw.map((r) => r.merchantId);
    const merchantNames = merchantIds.length
      ? await this.prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true },
        })
      : [];
    const merchantNameMap = Object.fromEntries(merchantNames.map((m) => [m.id, m.name]));
    const topMerchants = topMerchantsRaw.map((r) => ({
      name: merchantNameMap[r.merchantId] ?? r.merchantId.slice(0, 8),
      volume: Number(r._sum.amount ?? 0),
      orders: r._count._all,
    }));

    const traderIds = topTradersRaw.map((r) => r.traderId).filter(Boolean) as string[];
    const traderProfiles = traderIds.length
      ? await this.prisma.traderProfile.findMany({
          where: { id: { in: traderIds } },
          select: {
            id: true,
            user: { select: { email: true } },
            _count: { select: { payinOrders: { where: { status: 'PAID' } } } },
          },
        })
      : [];
    const traderMap = Object.fromEntries(traderProfiles.map((t) => [t.id, t]));
    const topTraders = topTradersRaw.map((r) => {
      const profile = traderMap[r.traderId!];
      const totalT = r._count._all;
      const successT = profile?._count?.payinOrders ?? 0;
      return {
        name: profile?.user?.email ?? (r.traderId?.slice(0, 8) ?? 'Unknown'),
        volume: Number(r._sum.amount ?? 0),
        successRate: totalT > 0 ? Math.round((successT / totalT) * 100) : 0,
      };
    });

    const dailyVolume: { date: string; payin: number; payout: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const [pi, po] = await Promise.all([
        this.prisma.payinOrder.aggregate({
          where: { status: 'PAID', createdAt: { gte: day, lte: dayEnd } },
          _sum: { amount: true },
        }),
        this.prisma.payoutOrder.aggregate({
          where: { status: 'COMPLETED', createdAt: { gte: day, lte: dayEnd } },
          _sum: { amount: true },
        }),
      ]);
      dailyVolume.push({
        date: day.toISOString().slice(0, 10),
        payin: Number(pi._sum.amount ?? 0),
        payout: Number(po._sum.amount ?? 0),
      });
    }

    return {
      totalVolume,
      payinVolume,
      payoutVolume,
      totalCommissions,
      totalOrders,
      completedOrders,
      avgOrderAmount,
      activeTraders,
      conversionRate,
      totalTraffic: totalVolume,
      ordersByStatus,
      topMerchants,
      topTraders,
      dailyVolume,
    };
  }
}

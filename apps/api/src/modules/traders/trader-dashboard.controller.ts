import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';

@ApiTags('Trader Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRADER)
@Controller('trader/dashboard')
export class TraderDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get trader dashboard stats' })
  async getStats(
    @CurrentUser('traderId') traderId: string,
    @CurrentUser('id') userId: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalVolumeAgg,
      ordersToday,
      successfulOrders,
      totalOrders,
      activeRequisites,
      profile,
    ] = await Promise.all([
      this.prisma.payinOrder.aggregate({
        where: { traderId, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.count({
        where: { traderId, createdAt: { gte: today } },
      }),
      this.prisma.payinOrder.count({
        where: { traderId, status: 'PAID' },
      }),
      this.prisma.payinOrder.count({
        where: { traderId },
      }),
      this.prisma.requisite.count({
        where: {
          traderId,
          isActive: true,
          group: { isActive: true, archivedAt: null },
        },
      }),
      this.prisma.traderProfile.findUnique({
        where: { userId },
        select: { acceptingOrders: true, isActive: true },
      }),
    ]);

    const successRate = totalOrders > 0
      ? (successfulOrders / totalOrders) * 100
      : 0;

    return {
      total_volume: totalVolumeAgg._sum.amount ?? 0,
      orders_today: ordersToday,
      success_rate: successRate,
      active_requisites: activeRequisites,
      currency: 'UAH',
      accepting_orders: profile?.acceptingOrders ?? true,
      account_active: profile?.isActive ?? true,
    };
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Get recent orders for trader' })
  async getRecentOrders(@CurrentUser('traderId') traderId: string) {
    const payinOrders = await this.prisma.payinOrder.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });

    const payoutOrders = await this.prisma.payoutOrder.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });

    const combined = [
      ...payinOrders.map((o) => ({
        id: o.id,
        type: 'payin' as const,
        amount: Number(o.amount),
        currency: o.currency,
        status: o.status,
        created_at: Math.floor(o.createdAt.getTime() / 1000),
      })),
      ...payoutOrders.map((o) => ({
        id: o.id,
        type: 'payout' as const,
        amount: Number(o.amount),
        currency: o.currency,
        status: o.status,
        created_at: Math.floor(o.createdAt.getTime() / 1000),
      })),
    ]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 10);

    return combined;
  }
}

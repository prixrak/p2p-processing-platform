import {
  Controller,
  Get,
  Header,
  MessageEvent,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { CascadeService } from '../cascade/cascade.service';
import { TradersService } from './traders.service';
import { WalletDepositEventsService } from '../wallet-deposits/wallet-deposit-events.service';

@ApiTags('Trader Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRADER)
@Controller('trader/dashboard')
export class TraderDashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradersService: TradersService,
    private readonly cascadeService: CascadeService,
    private readonly walletDepositEvents: WalletDepositEventsService,
  ) {}

  @SkipThrottle()
  @Sse('wallet-events/stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({
    summary: 'SSE stream for TRC-20 deposit credits (custodial / monitored top-ups)',
  })
  @ApiProduces('text/event-stream')
  streamWalletEvents(
    @CurrentUser('traderId') traderId: string,
  ): Observable<MessageEvent> {
    return this.walletDepositEvents.streamForTrader(traderId);
  }

  @Get('payin-assign-ranges')
  @ApiOperation({
    summary:
      'Effective Pay-In assignment amount bounds per requisite (manual vs cascade Fork autolimits)',
  })
  async getPayinAssignRanges(@CurrentUser('traderId') traderId: string) {
    return this.cascadeService.getEffectiveAssignRangesForTrader(traderId);
  }

  @Get('requisite-ratings')
  @ApiOperation({
    summary: 'Simplified cascade observability for own requisites (fill ratio, bounds, status)',
  })
  async getRequisiteRatings(@CurrentUser('traderId') traderId: string) {
    return this.cascadeService.listRequisiteRatingsForTrader(traderId);
  }

  @Get('usdt-wallet')
  @ApiOperation({
    summary:
      'USDT balance, overdraft capacity, and custodial monitored deposit addresses (operator-assigned)',
  })
  async getUsdtWallet(@CurrentUser('id') userId: string) {
    return this.tradersService.getUsdtWalletSummaryForUser(userId);
  }

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

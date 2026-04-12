import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

    return {
      totalUsers,
      totalMerchants,
      activeTraders,
      ordersToday,
      totalVolume,
      totalOrders,
      conversionRate,
      platformRevenue: 0,
      activePayins,
      activePayouts,
      pendingSettlements,
      disputesCount,
    };
  }
}

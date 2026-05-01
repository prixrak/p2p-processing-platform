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

@ApiTags('Merchant Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MERCHANT)
@Controller('merchant')
export class MerchantDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Get merchant balances' })
  async getBalances(@CurrentUser('merchantId') merchantId: string) {
    const balances = await this.prisma.merchantBalance.findMany({
      where: { merchantId },
      include: { currency: { select: { code: true } } },
    });
    return balances.map((b) => ({
      currency: b.currency.code,
      available: Number(b.amount),
      frozen: 0,
    }));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get merchant stats' })
  async getStats(@CurrentUser('merchantId') merchantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [ordersToday, successfulOrders, totalOrders, volumeAgg] =
      await Promise.all([
        this.prisma.payinOrder.count({
          where: { merchantId, createdAt: { gte: today } },
        }),
        this.prisma.payinOrder.count({
          where: { merchantId, status: 'PAID' },
        }),
        this.prisma.payinOrder.count({ where: { merchantId } }),
        this.prisma.payinOrder.aggregate({
          where: { merchantId, status: 'PAID' },
          _sum: { amount: true },
        }),
      ]);

    return {
      ordersToday,
      successRate: totalOrders > 0 ? (successfulOrders / totalOrders) * 100 : 0,
      totalVolume: Number(volumeAgg._sum.amount ?? 0),
    };
  }
}

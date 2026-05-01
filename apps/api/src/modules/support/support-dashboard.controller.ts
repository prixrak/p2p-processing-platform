import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, DirectionType } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';

@ApiTags('Support Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPPORT, UserRole.ADMIN, UserRole.OWNER)
@Controller('support')
export class SupportDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get support dashboard stats' })
  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      activeDisputes,
      ordersNeedingAttention,
      resolvedToday,
      recentAppeals,
      flaggedPayins,
    ] = await Promise.all([
      this.prisma.appeal.count({ where: { status: 'OPEN' } }),
      this.prisma.payinOrder.count({
        where: { status: { in: ['APPEAL', 'UNDERPAID', 'OVERPAID'] } },
      }),
      this.prisma.appeal.count({
        where: { status: 'RESOLVED', updatedAt: { gte: today } },
      }),
      this.prisma.appeal.findMany({
        where: { status: 'OPEN' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          payinOrder: {
            include: { merchant: { select: { name: true } } },
          },
        },
      }),
      this.prisma.payinOrder.findMany({
        where: { status: { in: ['APPEAL', 'UNDERPAID', 'OVERPAID'] } },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { currency: { select: { code: true } } },
      }),
    ]);

    return {
      activeDisputes,
      ordersNeedingAttention,
      avgResolutionTime: '~2h',
      resolvedToday,
      recentDisputes: recentAppeals.map((a) => ({
        id: a.id,
        orderId: a.payinOrderId,
        merchantName: a.payinOrder?.merchant?.name ?? '—',
        reason: `Paid amount: ${Number(a.paidAmount)}`,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      flaggedOrders: flaggedPayins.map((o) => ({
        id: o.id,
        type: DirectionType.PAYIN,
        amount: Number(o.amount),
        currency: o.currency.code,
        status: o.status,
        reason: o.status === 'UNDERPAID' ? 'Underpaid' : o.status === 'OVERPAID' ? 'Overpaid' : 'Appeal',
      })),
    };
  }
}

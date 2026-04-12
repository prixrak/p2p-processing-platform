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

    const [activeDisputes, ordersNeedingAttention, resolvedToday] =
      await Promise.all([
        this.prisma.appeal.count({ where: { status: 'OPEN' } }),
        this.prisma.payinOrder.count({
          where: { status: { in: ['APPEAL', 'UNDERPAID', 'OVERPAID'] } },
        }),
        this.prisma.appeal.count({
          where: { status: 'RESOLVED', updatedAt: { gte: today } },
        }),
      ]);

    return {
      activeDisputes,
      ordersNeedingAttention,
      avgResolutionTime: '~2h',
      resolvedToday,
      recentDisputes: [],
      flaggedOrders: [],
    };
  }
}

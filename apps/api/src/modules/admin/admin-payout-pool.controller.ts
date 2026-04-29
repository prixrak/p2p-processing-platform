import {
  Controller,
  Get,
  Patch,
  Put,
  Body,
  Query,
  Param,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import { UpdatePayoutPoolGlobalDto, UpsertMerchantPayoutPoolDto } from './dto/payout-pool.dto';

const PAYOUT_POOL_SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';

@ApiTags('Admin — Pay-Out pool')
@ApiBearerAuth()
@Controller('admin/payout-pool')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPayoutPoolController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('global')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Global specialist pool B settings' })
  async getGlobal() {
    const row = await this.prisma.payoutPoolSetting.findUnique({
      where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
      include: { updatedBy: { select: { email: true, id: true } } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      pool_b_global_percent: Number(row.poolBGlobalPercent),
      pool_timeout_enabled: row.poolTimeoutEnabled,
      pool_timeout_hours: row.poolTimeoutHours,
      specialist_fail_returns_to_pool: row.specialistFailReturnsToPool,
      updated_at: row.updatedAt,
      updated_by: row.updatedBy,
    };
  }

  @Patch('global')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update global pool B routing' })
  async patchGlobal(
    @Body() dto: UpdatePayoutPoolGlobalDto,
    @CurrentUser('id') userId: string,
  ) {
    const data: Record<string, unknown> = {
      updatedById: userId,
    };
    if (dto.pool_b_global_percent !== undefined) {
      data.poolBGlobalPercent = dto.pool_b_global_percent;
    }
    if (dto.pool_timeout_enabled !== undefined) {
      data.poolTimeoutEnabled = dto.pool_timeout_enabled;
    }
    if (dto.pool_timeout_hours !== undefined) {
      data.poolTimeoutHours = dto.pool_timeout_hours;
    }
    if (dto.specialist_fail_returns_to_pool !== undefined) {
      data.specialistFailReturnsToPool = dto.specialist_fail_returns_to_pool;
    }

    const row = await this.prisma.payoutPoolSetting.update({
      where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
      data: data as any,
    });

    return {
      id: row.id,
      pool_b_global_percent: Number(row.poolBGlobalPercent),
      pool_timeout_enabled: row.poolTimeoutEnabled,
      pool_timeout_hours: row.poolTimeoutHours,
      specialist_fail_returns_to_pool: row.specialistFailReturnsToPool,
      updated_at: row.updatedAt,
    };
  }

  @Get('merchants')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Merchant-specific pool B assignments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listMerchantAssignments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.merchantPayoutPoolAssignment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { id: true, name: true } },
          createdBy: { select: { email: true, id: true } },
        },
      }),
      this.prisma.merchantPayoutPoolAssignment.count(),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        merchant_id: r.merchantId,
        merchant_name: r.merchant.name,
        pool_b_percent: Number(r.poolBPercent),
        is_active: r.isActive,
        created_at: r.createdAt,
        created_by: r.createdBy,
      })),
      total,
      page,
      limit,
    };
  }

  @Put('merchants/:merchantId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create or update merchant pool B assignment' })
  async upsertMerchant(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: UpsertMerchantPayoutPoolDto,
    @CurrentUser('id') userId: string,
  ) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    const row = await this.prisma.merchantPayoutPoolAssignment.upsert({
      where: { merchantId },
      create: {
        merchantId,
        poolBPercent: dto.pool_b_percent,
        isActive: dto.is_active ?? true,
        createdById: userId,
      },
      update: {
        poolBPercent: dto.pool_b_percent,
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      },
    });

    return {
      id: row.id,
      merchant_id: row.merchantId,
      pool_b_percent: Number(row.poolBPercent),
      is_active: row.isActive,
    };
  }
}

import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import {
  UpdatePayoutPoolGlobalDto,
  UpsertMerchantPayoutPoolAssignmentDto,
  PatchMerchantPayoutPoolAssignmentDto,
} from './dto/payout-pool.dto';

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

  @Get('merchants/directory')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({
    summary:
      'Merchants for pool B assignment UI: first 50 active (unlocked) when q is empty; otherwise case-insensitive name search (same cap)',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  async searchMerchantDirectory(
    @Query('q') q: string,
  ) {
    const term = (q ?? '').trim();
    const baseWhere = {
      isLock: false,
      user: { isActive: true },
    };
    const where =
      term.length >= 1
        ? {
            ...baseWhere,
            name: { contains: term, mode: 'insensitive' as const },
          }
        : baseWhere;

    const rows = await this.prisma.merchant.findMany({
      where,
      select: { id: true, name: true },
      take: 50,
      orderBy: { name: 'asc' },
    });

    return {
      items: rows.map((m) => ({
        merchant_id: m.id,
        display_name: m.name,
      })),
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

  @Put('merchants/assignment')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create or update merchant pool B assignment by display name' })
  async upsertMerchantAssignment(
    @Body() dto: UpsertMerchantPayoutPoolAssignmentDto,
    @CurrentUser('id') userId: string,
  ) {
    const displayName = dto.merchant_display_name.trim();
    const merchant = await this.prisma.merchant.findUnique({
      where: { name: displayName },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with display name "${displayName}" not found`);
    }
    const merchantId = merchant.id;

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
      merchant_display_name: merchant.name,
      pool_b_percent: Number(row.poolBPercent),
      is_active: row.isActive,
    };
  }

  @Patch('merchants/assignment/:merchantId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update an existing merchant pool B assignment by merchant id' })
  async patchMerchantAssignment(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: PatchMerchantPayoutPoolAssignmentDto,
  ) {
    if (dto.pool_b_percent === undefined && dto.is_active === undefined) {
      throw new BadRequestException(
        'At least one of pool_b_percent or is_active is required',
      );
    }

    const existing = await this.prisma.merchantPayoutPoolAssignment.findUnique({
      where: { merchantId },
      include: { merchant: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`No pool B assignment found for merchant ${merchantId}`);
    }

    const data: Record<string, unknown> = {};
    if (dto.pool_b_percent !== undefined) {
      data.poolBPercent = dto.pool_b_percent;
    }
    if (dto.is_active !== undefined) {
      data.isActive = dto.is_active;
    }

    const row = await this.prisma.merchantPayoutPoolAssignment.update({
      where: { merchantId },
      data: data as any,
      include: { merchant: { select: { id: true, name: true } } },
    });

    return {
      id: row.id,
      merchant_id: row.merchantId,
      merchant_display_name: row.merchant.name,
      pool_b_percent: Number(row.poolBPercent),
      is_active: row.isActive,
    };
  }

  @Delete('merchants/assignment/:merchantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Remove merchant pool B override',
    description:
      'Deletes the assignment row so new Pay-Out orders for this merchant use global pool B percent only.',
  })
  async deleteMerchantAssignment(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    const existing = await this.prisma.merchantPayoutPoolAssignment.findUnique({
      where: { merchantId },
    });
    if (!existing) {
      throw new NotFoundException(`No pool B assignment found for merchant ${merchantId}`);
    }

    await this.prisma.merchantPayoutPoolAssignment.delete({
      where: { merchantId },
    });
  }
}

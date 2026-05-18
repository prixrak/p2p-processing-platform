import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  DefaultValuePipe,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { CascadeService } from '../cascade/cascade.service';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import { TradersService } from '../traders/traders.service';
import { UpdateCascadeSettingsDto } from './dto/update-cascade-settings.dto';
import { CreateCoverageNominalDto } from './dto/create-coverage-nominal.dto';
import { UpdateCoverageNominalDto } from './dto/update-coverage-nominal.dto';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
} from '../platform-settings/platform-settings.service';

@ApiTags('Admin — Cascade')
@ApiBearerAuth()
@Controller('admin/cascade')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCascadeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cascadeService: CascadeService,
    private readonly cascadeCoverageCache: CascadeRedisStateService,
    private readonly tradersService: TradersService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Get('method-policy')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({
    summary:
      'Fork / Card / Provider traffic share rules and current global percentages (TZ v3.1)',
  })
  async methodPolicy() {
    return this.tradersService.getCascadeMethodPolicySummary();
  }

  @Get('settings')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Cascade routing global settings' })
  async getSettings() {
    return this.buildCascadeSettingsResponse();
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update cascade settings (Owner / Admin)' })
  async patchSettings(
    @Body() dto: UpdateCascadeSettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    await this.cascadeService.updateSettings(
      {
        autolimitThreshold: dto.autolimit_threshold,
        autolimitEnabled: dto.autolimit_enabled,
        forkTrafficPercent: dto.fork_traffic_percent,
        cardTrafficPercent: dto.card_traffic_percent,
        providerTrafficPercent: dto.provider_traffic_percent,
        levelPickMode: dto.level_pick_mode,
        fillMultipliersConfig: dto.fill_multipliers_config,
      },
      userId,
    );
    await this.cascadeCoverageCache.invalidateAll();
    return this.buildCascadeSettingsResponse();
  }

  /** Snapshot of cascade settings combined with the platform `payin_provider_integration_enabled` flag. */
  private async buildCascadeSettingsResponse() {
    const s = await this.cascadeService.getSettings();
    const integration = await this.platformSettings.findOne(
      PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
    );
    return {
      autolimit_threshold: Number(s.autolimitThreshold),
      autolimit_enabled: s.autolimitEnabled,
      fork_traffic_percent: Number(s.forkTrafficPercent),
      card_traffic_percent: Number(s.cardTrafficPercent),
      provider_traffic_percent: Number(s.providerTrafficPercent),
      level_pick_mode: s.levelPickMode,
      fill_multipliers_config: s.fillMultipliersConfig ?? null,
      updated_at: s.updatedAt,
      payin_provider_integration_enabled:
        integration.value.trim().toLowerCase() === 'true',
    };
  }

  @Get('coverage')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({
    summary:
      'Nominal coverage — count of active requisites that can accept each configured amount',
  })
  async coverage(
    @Query('currency', new DefaultValuePipe('UAH')) currency: string,
  ) {
    const rows = await this.cascadeService.getCoverageByNominals(currency.trim());
    return { currency: currency.trim(), nominals: rows };
  }

  @Get('requisite-ratings')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Requisite cascade observability (rating table, TZ)' })
  async requisiteRatings(
    @Query('currency', new DefaultValuePipe('UAH')) currency: string,
    @Query('preview_amount') previewAmountRaw?: string,
    @Query('trader_id') traderId?: string,
    @Query('method') method?: string,
    @Query('status') statusFilter?: string,
    @Query('autolimit') autolimitFilter?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('sort_dir') sortDir?: string,
  ) {
    let preview_amount: number | undefined;
    if (previewAmountRaw !== undefined && previewAmountRaw !== '') {
      const n = Number(previewAmountRaw);
      preview_amount = Number.isFinite(n) ? n : undefined;
    }
    return this.cascadeService.listRequisiteRatingsForStaff({
      currency: currency.trim(),
      preview_amount,
      trader_id: traderId,
      method:
        method === 'CARD' || method === 'FORK' || method === 'ALL' ? method : 'ALL',
      status_filter:
        statusFilter === 'all' ||
        statusFilter === 'active' ||
        statusFilter === 'locked' ||
        statusFilter === 'ineligible' ||
        statusFilter === 'disabled'
          ? statusFilter
          : 'active',
      autolimit_filter:
        autolimitFilter === 'on' || autolimitFilter === 'off' ? autolimitFilter : 'all',
      q,
      sort:
        sort === 'rating' ||
        sort === 'trader' ||
        sort === 'remainder' ||
        sort === 'status' ||
        sort === 'rank'
          ? sort
          : 'rank',
      sort_dir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : 'asc',
    });
  }

  @Get('assignment-explain')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({
    summary:
      'Hypothetical cascade assignment order for an amount (observability). ' +
      'When `amount` is omitted, ranks candidates eligible for at least one active coverage nominal (all-grid preview). ' +
      '`amount=0` evaluates gates at zero (explicit preview).',
  })
  async assignmentExplain(
    @Query('currency', new DefaultValuePipe('UAH')) currency: string,
    @Query('amount') amountRaw?: string,
    @Query('detailed') detailedRaw?: string,
  ) {
    let amount: number | undefined;
    if (amountRaw !== undefined && amountRaw !== '') {
      const n = Number(amountRaw);
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestException('amount must be a non-negative number');
      }
      amount = n;
    }
    const detailed = detailedRaw !== 'false' && detailedRaw !== '0';
    return this.cascadeService.explainAssignmentOrder(currency.trim(), amount, {
      detailed,
    });
  }

  @Get('nominals')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Coverage nominal grid (all rows, including inactive)' })
  async listNominals() {
    const rows = await this.prisma.coverageNominalSetting.findMany({
      orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
    });
    return {
      nominals: rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        sort_order: r.sortOrder,
        is_active: r.isActive,
        created_at: r.createdAt.toISOString(),
      })),
    };
  }

  @Post('nominals')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add a nominal to the coverage grid' })
  async createNominal(
    @Body() dto: CreateCoverageNominalDto,
    @CurrentUser('id') userId: string,
  ) {
    const row = await this.prisma.coverageNominalSetting.create({
      data: {
        amount: dto.amount,
        sortOrder: dto.sort_order ?? 0,
        isActive: dto.is_active ?? true,
        createdById: userId,
      },
    });
    await this.cascadeCoverageCache.invalidateAll();
    return {
      id: row.id,
      amount: Number(row.amount),
      sort_order: row.sortOrder,
      is_active: row.isActive,
    };
  }

  @Patch('nominals/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a coverage nominal' })
  async patchNominal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoverageNominalDto,
  ) {
    const row = await this.prisma.coverageNominalSetting.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.sort_order !== undefined ? { sortOrder: dto.sort_order } : {}),
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      },
    });
    await this.cascadeCoverageCache.invalidateAll();
    return {
      id: row.id,
      amount: Number(row.amount),
      sort_order: row.sortOrder,
      is_active: row.isActive,
    };
  }

  @Delete('nominals/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Remove a nominal from the coverage grid' })
  async deleteNominal(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.coverageNominalSetting.delete({ where: { id } });
    await this.cascadeCoverageCache.invalidateAll();
    return { ok: true };
  }
}

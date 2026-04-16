import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audited.decorator';
import { AuditAction, AuditEntityType, UserRole } from '@p2p/shared';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_KEYS,
  PlatformSettingKey,
} from './platform-settings.service';

class UpsertSettingDto {
  @ApiProperty({ enum: PLATFORM_SETTING_KEYS })
  @IsIn(PLATFORM_SETTING_KEYS)
  key: PlatformSettingKey;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  value: string;
}

class UpsertManySettingsDto {
  @ApiProperty({ type: [UpsertSettingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertSettingDto)
  settings: UpsertSettingDto[];
}

@ApiTags('Platform Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly svc: PlatformSettingsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List all platform settings with current values' })
  findAll() {
    return this.svc.findAll();
  }

  @Get(':key')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a single platform setting by key' })
  findOne(@Param('key') key: PlatformSettingKey) {
    return this.svc.findOne(key);
  }

  @Put(':key')
  @Roles(UserRole.OWNER)
  @Audited(AuditAction.UPDATE, AuditEntityType.PlatformSetting)
  @ApiOperation({ summary: 'Set a single platform setting (Owner only)' })
  upsertOne(
    @Param('key') key: PlatformSettingKey,
    @Body() dto: UpsertSettingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.upsert(key, dto.value, userId);
  }

  @Put()
  @Roles(UserRole.OWNER)
  @Audited(AuditAction.UPDATE, AuditEntityType.PlatformSetting)
  @ApiOperation({ summary: 'Bulk-update multiple platform settings (Owner only)' })
  upsertMany(
    @Body() dto: UpsertManySettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.upsertMany(dto.settings, userId);
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DirectionType } from '@p2p/shared';

export const APPLICATION_LOG_PERIOD_VALUES = [
  'today',
  'yesterday',
  '7d',
  '30d',
  'this_month',
  'last_month',
] as const;

export type ApplicationLogPeriod = (typeof APPLICATION_LOG_PERIOD_VALUES)[number];

/** Shared filters for application logs list + summary (charts). */
export class ApplicationLogsQueryDto {
  @ApiPropertyOptional({
    enum: APPLICATION_LOG_PERIOD_VALUES,
    description:
      'Preset window (UTC calendar boundaries). Used when dateFrom/dateTo are omitted; defaults to today.',
  })
  @Transform(({ value }) => (value === '' || value == null ? undefined : String(value).trim()))
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsIn(APPLICATION_LOG_PERIOD_VALUES)
  period?: ApplicationLogPeriod;

  @ApiPropertyOptional({
    description:
      'Inclusive period start (ISO 8601). Must be sent together with dateTo; overrides period when both are set.',
  })
  @Transform(({ value }) => (value === '' || value == null ? undefined : String(value).trim()))
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive period end (ISO 8601). Must be sent together with dateFrom; overrides period when both are set.',
  })
  @Transform(({ value }) => (value === '' || value == null ? undefined : String(value).trim()))
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ enum: DirectionType })
  @IsOptional()
  @IsEnum(DirectionType)
  kind?: DirectionType;

  @ApiPropertyOptional({ enum: ['SUCCESS', 'ERROR', 'PENDING'] })
  @IsOptional()
  @IsEnum(['SUCCESS', 'ERROR', 'PENDING'] as const)
  uiStatus?: 'SUCCESS' | 'ERROR' | 'PENDING';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Pay-In/Pay-Out standard trader profile id' })
  @IsOptional()
  @IsUUID('4')
  traderId?: string;

  @ApiPropertyOptional({ description: 'Currency code (e.g. UAH)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @ApiPropertyOptional({ description: 'Partner IP contains (substring)' })
  @IsOptional()
  @IsString()
  partnerIp?: string;

  @ApiPropertyOptional({
    description:
      'Normalized application-log error code (Pay-In: NO_REQUISITE, PayinNoRequisiteReason codes, UPLOAD_FAILED; Pay-Out: FAILED, UPLOAD_FAILED, FOREIGN_CARD, …)',
  })
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

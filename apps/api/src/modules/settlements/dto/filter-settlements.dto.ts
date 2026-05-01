import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  Min,
  Max,
  IsNumber,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementType } from '@p2p/shared';

/** Single scalar from querystring (omit "", pick first element if array). */
function queryScalar<T = string>(value: unknown): T | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === '' || raw === undefined || raw === null) return undefined;
  return raw as T;
}

function queryOptInt(value: unknown): number | undefined {
  const raw = queryScalar(value);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

export class FilterSettlementsDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Transform(({ value }) => queryOptInt(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @Transform(({ value }) => queryOptInt(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by trader profile ID' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsUUID()
  traderId?: string;

  @ApiPropertyOptional({ description: 'Filter by Pay-Out specialist profile ID' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsUUID()
  payoutTraderId?: string;

  @ApiPropertyOptional({ description: 'Filter by merchant ID' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Filter by recording admin ID' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ enum: SettlementType })
  @Transform(({ value }) => {
    const v = queryScalar<string>(value);
    return typeof v === 'string' ? v.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsEnum(SettlementType)
  type?: SettlementType;

  @ApiPropertyOptional({ description: 'Filter by settlement currency code' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @Transform(({ value }) => {
    const s = queryScalar<string>(value);
    return typeof s === 'string' ? s.trim() || undefined : undefined;
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Minimum settlement principal amount (`amount`)' })
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === '' || raw === undefined || raw === null) return undefined;
    return Number(raw);
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum settlement principal amount (`amount`)' })
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === '' || raw === undefined || raw === null) return undefined;
    return Number(raw);
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;
}

import { IsOptional, IsNumber, IsString, Min, Max, IsIn, IsDateString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { MAX_PAGE_SIZE } from '@p2p/shared';
import { normalizeOrderListSearch } from '../../../common/order-search-where';

export class PayoutListFiltersDto {
  @ApiPropertyOptional({
    enum: ['in_progress', 'history'],
    description:
      'Trader queue slice: in_progress (NEW, PROCESSING) or history (COMPLETED, FAILED, UPLOAD_FAILED).',
  })
  @IsOptional()
  @IsIn(['in_progress', 'history'])
  queue?: 'in_progress' | 'history';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Search by order id (full UUID), merchant request_id, recipient card/account number, owner, or code',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeOrderListSearch(value) : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filter by date range on created_at (in progress / pool) or end_at when queue=history (ISO 8601 date, UTC interpreted as calendar day).',
    example: '2026-04-01',
  })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Minimum order amount (fiat face).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_amount?: number;

  @ApiPropertyOptional({ description: 'Maximum order amount (fiat face).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_amount?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

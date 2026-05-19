import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppealStatus, MAX_PAGE_SIZE } from '@p2p/shared';
import { Transform, Type } from 'class-transformer';
import { normalizeOrderListSearch } from '../../../common/order-search-where';

export class AppealFiltersDto {
  @ApiPropertyOptional({ enum: AppealStatus })
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;

  @ApiPropertyOptional({ description: 'Filter by Pay-In order ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description:
      'Search by appeal id, pay-in order id, request id, requisite number, owner, or card holder name',
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
      'Trader cabinet shorthand: open appeals (`current`) vs resolved/rejected (`history`). When set, ignores `status`.',
    enum: ['current', 'history'],
  })
  @IsOptional()
  @IsIn(['current', 'history'])
  listBucket?: 'current' | 'history';

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

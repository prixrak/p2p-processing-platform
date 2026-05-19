import { IsString, IsOptional, IsNumber, IsEnum, IsPositive, Min, Max, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayInOrderStatus, MAX_PAGE_SIZE } from '@p2p/shared';
import { Transform, Type } from 'class-transformer';
import { normalizeOrderListSearch } from '../../../common/order-search-where';

export class TraderOrderFiltersDto {
  @ApiPropertyOptional({ enum: PayInOrderStatus })
  @IsOptional()
  @IsEnum(PayInOrderStatus)
  status?: PayInOrderStatus;

  @ApiPropertyOptional({
    enum: ['current', 'history'],
    description:
      'current: PENDING, NEW, VERIFIED, APPEAL; history: PAID, UNDERPAID, OVERPAID, CANCELED, UPLOAD_FAILED, NO_REQUISITE',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsIn(['current', 'history'])
  list?: 'current' | 'history';

  @ApiPropertyOptional({
    description:
      'Search by order id (full or partial UUID), merchant request_id, requisite number, account owner, or card holder name',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeOrderListSearch(value) : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export class TraderConfirmPaidDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;

  @ApiPropertyOptional({ description: 'Actual amount received. If differs from order amount, status becomes UNDERPAID/OVERPAID' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  actualAmount?: number;
}

import { IsString, IsOptional, IsNumber, IsEnum, IsPositive, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayInOrderStatus, MAX_PAGE_SIZE } from '@p2p/shared';
import { Type } from 'class-transformer';

export class TraderOrderFiltersDto {
  @ApiPropertyOptional({ enum: PayInOrderStatus })
  @IsOptional()
  @IsEnum(PayInOrderStatus)
  status?: PayInOrderStatus;

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

export class TraderCancelOrderDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;
}

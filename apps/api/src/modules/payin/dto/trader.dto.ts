import { IsString, IsOptional, IsNumber, IsEnum, IsPositive, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayInOrderStatus } from '@p2p/shared';
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
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
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

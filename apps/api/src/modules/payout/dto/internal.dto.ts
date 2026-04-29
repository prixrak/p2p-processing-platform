import { IsString, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignToTraderDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({ description: 'Standard trader profile UUID (pool A)' })
  @ValidateIf((o) => !o.payoutTraderId)
  @IsUUID()
  traderId?: string;

  @ApiPropertyOptional({ description: 'Pay-Out specialist profile UUID (pool B)' })
  @ValidateIf((o) => !o.traderId)
  @IsUUID()
  payoutTraderId?: string;
}

export class TraderTakeOrderDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;
}

export class TraderCompleteDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;
}

export class TraderFailDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;

  @ApiPropertyOptional({ description: 'Failure reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

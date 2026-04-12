import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignToTraderDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsString()
  orderId!: string;

  @ApiProperty({ description: 'Trader profile UUID' })
  @IsString()
  traderId!: string;
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

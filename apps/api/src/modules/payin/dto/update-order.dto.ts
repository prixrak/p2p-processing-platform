import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayInOrderStatus } from '@p2p/shared';

export class UpdateOrderDto {
  @ApiPropertyOptional({ description: 'Order UUID in the system' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Merchant-side order ID' })
  @IsOptional()
  @IsString()
  request_id?: string;

  @ApiPropertyOptional({
    description: 'New status: VERIFIED or CANCELED',
    enum: [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED],
  })
  @IsOptional()
  @IsEnum(PayInOrderStatus)
  status?: PayInOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_url?: string;
}

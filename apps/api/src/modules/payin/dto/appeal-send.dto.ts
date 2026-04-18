import { IsString, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AppealSendDto {
  @ApiProperty({ description: 'Order ID to appeal' })
  @IsString()
  order_id!: string;

  @ApiProperty({ description: 'Amount actually paid by the client' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  paid_amount!: number;

  @ApiProperty({ description: 'Unix timestamp in milliseconds' })
  @Type(() => Number)
  @IsNumber()
  nonce!: number;
}

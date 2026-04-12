import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class OrderInfoDto {
  @ApiPropertyOptional({ description: 'Order UUID in the system' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Merchant-side order ID' })
  @IsOptional()
  @IsString()
  request_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_url?: string;
}

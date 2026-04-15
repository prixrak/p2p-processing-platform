import { IsString, IsNumber, IsOptional, IsPositive, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class H2hInitDto {
  @ApiProperty({ description: 'Merchant-side order ID, must be unique' })
  @IsString()
  request_id!: string;

  @ApiProperty({ description: 'Order amount' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Currency code' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: 'URL for redirect after payment' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  redirect_url!: string;

  @ApiPropertyOptional({ description: 'Payer full name' })
  @IsOptional()
  @IsString()
  user_full_name?: string;

  @ApiPropertyOptional({ description: 'Merchant-side user ID' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Webhook callback URL' })
  @IsOptional()
  @IsString()
  callback_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_url?: string;
}

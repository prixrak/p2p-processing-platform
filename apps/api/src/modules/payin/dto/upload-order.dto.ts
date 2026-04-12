import { IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadOrderDto {
  @ApiProperty({ description: 'Merchant-side order ID, must be unique' })
  @IsString()
  request_id!: string;

  @ApiProperty({ description: 'Order amount' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Currency code, e.g. UAH' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: 'Payer full name' })
  @IsString()
  user_full_name!: string;

  @ApiPropertyOptional({ description: 'Merchant-side user ID' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Webhook callback URL' })
  @IsOptional()
  @IsString()
  callback_url?: string;

  @ApiPropertyOptional({ description: 'Unix timestamp nonce' })
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional({ description: 'Current API URL (service field)' })
  @IsOptional()
  @IsString()
  api_url?: string;
}

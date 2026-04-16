import { IsString, IsNumber, IsOptional, IsPositive, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DetailsType } from '@p2p/shared';

export class PayoutDetailsDto {
  @ApiProperty({ description: 'Requisite type: CARD or IBAN', enum: DetailsType })
  @IsEnum(DetailsType)
  type!: DetailsType;

  @ApiProperty({ description: 'Card number or IBAN' })
  @IsString()
  number!: string;

  @ApiPropertyOptional({ description: 'Requisite owner name' })
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({ description: 'Bank code' })
  @IsOptional()
  @IsString()
  code?: string;
}

export class OrderUploadDto {
  @ApiProperty({ description: 'Merchant-side order ID, must be unique' })
  @IsString()
  request_id!: string;

  @ApiProperty({ description: 'Currency code' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: 'Payout amount' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Recipient requisite details', type: PayoutDetailsDto })
  @ValidateNested()
  @Type(() => PayoutDetailsDto)
  details!: PayoutDetailsDto;

  @ApiPropertyOptional({ description: 'Webhook callback URL' })
  @IsOptional()
  @IsString()
  callback_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional({
    description:
      'Request URL or path for HMAC v2; must match this endpoint (e.g. /api/external/v1/payout/order_upload).',
  })
  @IsOptional()
  @IsString()
  api_url?: string;
}

import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementType } from '@p2p/shared';

export class CreateSettlementDto {
  /** Standard trader (Pay-In) profile ID — mutually exclusive with others. */
  @ApiPropertyOptional({ description: 'Standard trader profile ID' })
  @IsUUID()
  @IsOptional()
  traderId?: string;

  /** Pay-Out specialist profile ID — mutually exclusive with others. */
  @ApiPropertyOptional({ description: 'Pay-Out specialist profile ID' })
  @IsUUID()
  @IsOptional()
  payoutTraderId?: string;

  /** Merchant ID — mutually exclusive with others (fiat withdrawal booking). */
  @ApiPropertyOptional({ description: 'Merchant ID (settlements handbook — merchant withdrawals)' })
  @IsUUID()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ enum: SettlementType, description: 'CREDIT or DEBIT (merchant withdrawals are DEBIT only)' })
  @IsEnum(SettlementType)
  type: SettlementType;

  @ApiProperty({ description: 'Settlement principal amount', minimum: 0.0001 })
  @IsNumber()
  @Min(0.0001)
  amount: number;

  @ApiProperty({ description: 'Currency code of `amount`' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: 'Admin note / reason (audit)' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Destination USDT address when distributing to a Pay-Out specialist or merchant (audit)',
  })
  @IsString()
  @IsOptional()
  usdtAddress?: string;

  @ApiPropertyOptional({
    description: 'Merchant manual rate (local per 1 USDT), fixed at payout time — required when merchantId is set',
  })
  @ValidateIf((o) => Boolean(o.merchantId))
  @IsNumber()
  @Min(0.000001)
  manualRate?: number;

  @ApiPropertyOptional({
    description: 'Merchant: USDT amount sent after conversion — required when merchantId is set (admin-declared)',
  })
  @ValidateIf((o) => Boolean(o.merchantId))
  @IsNumber()
  @Min(0.000001)
  usdtEquivalent?: number;
}

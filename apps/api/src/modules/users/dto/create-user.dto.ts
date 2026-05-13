import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  IsOptional,
  MinLength,
  IsUUID,
  IsNumber,
  Min,
  Max,
  ValidateIf,
  IsEnum,
} from 'class-validator';
import { UserRole } from '@p2p/shared';
import { TraderProcessingMethod } from '@prisma/client';

export const CREATABLE_USER_ROLES = [
  UserRole.ADMIN,
  UserRole.TRADER,
  UserRole.PAYOUT_TRADER,
  UserRole.MERCHANT,
  UserRole.SUPPORT,
  UserRole.REFERRAL,
] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: CREATABLE_USER_ROLES, example: UserRole.TRADER })
  @IsIn([...CREATABLE_USER_ROLES])
  role: (typeof CREATABLE_USER_ROLES)[number];

  @ApiPropertyOptional({
    description: 'Country UUID (required when role is PAYOUT_TRADER) — defines geo / fiat pool',
  })
  @IsUUID()
  @IsOptional()
  countryId?: string;

  @ApiPropertyOptional({
    description:
      'Pay-Out rate fraction for Pay-Out specialist (e.g. 0.01 = 1%); ignored for other roles',
  })
  @ValidateIf((o) => o.role === UserRole.PAYOUT_TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  payoutRate?: number;

  @ApiPropertyOptional({
    description: 'USDT overdraft limit when role is TRADER (0 = none)',
    example: 0,
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1e12)
  overdraftLimitUsdt?: number;

  @ApiPropertyOptional({
    description: 'Trader-only Pay-In rate as fraction (0.01 = +1% on parser divisor)',
    example: 0,
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(0.5)
  payinRate?: number;

  @ApiPropertyOptional({
    description: 'Trader-only Pay-Out rate fraction (0.002 = 0.2%)',
    example: 0,
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(0.5)
  traderPayoutRate?: number;

  @ApiPropertyOptional({
    description:
      'Trader payout pool min order amount (0 = no min). Must be <= max when max > 0.',
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payoutMinLimit?: number;

  @ApiPropertyOptional({
    description: 'Trader payout pool max order amount (0 = no max)',
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payoutMaxLimit?: number;

  @ApiPropertyOptional({
    enum: TraderProcessingMethod,
    description:
      'Pay-In cascade processing method when role is TRADER (CARD vs FORK; affects Fork autolimits and cascade weighting)',
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @IsEnum(TraderProcessingMethod)
  processingMethod?: TraderProcessingMethod;

  @ApiPropertyOptional({
    description:
      'Trader-only Pay-In cascade idle-race multiplier (1 = default; TZ v3.1)',
    example: 1,
  })
  @ValidateIf((o) => o.role === UserRole.TRADER)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  cascadeRatingMultiplier?: number;

  @ApiPropertyOptional({
    description: 'Referral commission percent (0–100) when role is REFERRAL',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  referralPercent?: number;

  @ApiPropertyOptional({ description: 'Referral balance currency when role is REFERRAL', example: 'UAH' })
  @IsOptional()
  @IsString()
  referralCurrency?: string;

  @ApiPropertyOptional({
    description: 'Merchant display name (required when role is MERCHANT)',
    example: 'Acme Corp',
  })
  @ValidateIf((o) => o.role === UserRole.MERCHANT)
  @IsString()
  @MinLength(1)
  merchantName?: string;
}

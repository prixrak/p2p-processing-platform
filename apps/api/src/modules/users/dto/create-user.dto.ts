import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { UserRole } from '@p2p/shared';

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

  @ApiPropertyOptional({ description: 'Pay-Out rate fraction for specialist (e.g. 0.01 = 1%)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  payoutRate?: number;

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

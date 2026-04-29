import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, IsOptional, MinLength, IsUUID, IsNumber, Min } from 'class-validator';
import { UserRole } from '@p2p/shared';

export const CREATABLE_USER_ROLES = [
  UserRole.ADMIN,
  UserRole.TRADER,
  UserRole.PAYOUT_TRADER,
  UserRole.MERCHANT,
  UserRole.SUPPORT,
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
}

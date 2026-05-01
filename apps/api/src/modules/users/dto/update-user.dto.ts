import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@p2p/shared';

const UPDATABLE_ROLES = [
  UserRole.ADMIN,
  UserRole.TRADER,
  UserRole.MERCHANT,
  UserRole.SUPPORT,
  UserRole.REFERRAL,
] as const;

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'new@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: UPDATABLE_ROLES })
  @IsOptional()
  @IsIn([...UPDATABLE_ROLES])
  role?: (typeof UPDATABLE_ROLES)[number];

  @ApiPropertyOptional({ description: 'Activate or deactivate the account' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'When assigning MERCHANT, supply a display name if no merchant profile exists yet. Optional when renaming an existing merchant.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  merchantName?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '@p2p/shared';

const UPDATABLE_ROLES = [
  UserRole.ADMIN,
  UserRole.TRADER,
  UserRole.MERCHANT,
  UserRole.SUPPORT,
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
}

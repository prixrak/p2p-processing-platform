import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { UserRole } from '@p2p/shared';

export const CREATABLE_USER_ROLES = [
  UserRole.ADMIN,
  UserRole.TRADER,
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
}

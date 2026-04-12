import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';

const ALLOWED_SELF_REGISTER_ROLES = [UserRole.TRADER, UserRole.MERCHANT] as const;

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: ALLOWED_SELF_REGISTER_ROLES, example: UserRole.TRADER })
  @IsEnum(ALLOWED_SELF_REGISTER_ROLES)
  role: UserRole;
}

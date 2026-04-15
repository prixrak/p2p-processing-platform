import { IsEmail, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({ description: 'Email for the new referral user account' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Password for the new referral user account' })
  @IsString()
  password!: string;

  @ApiPropertyOptional({ description: 'Referral commission percent (0–100)', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  referralPercent?: number;

  @ApiPropertyOptional({ description: 'Currency for referral balance', example: 'UAH' })
  @IsOptional()
  @IsString()
  currency?: string;
}

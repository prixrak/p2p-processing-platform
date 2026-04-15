import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateReferralDto {
  @ApiPropertyOptional({ description: 'Referral commission percent (0–100)', example: 7.5 })
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

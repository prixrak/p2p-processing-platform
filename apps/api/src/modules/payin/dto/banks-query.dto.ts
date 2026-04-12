import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BanksQueryDto {
  @ApiPropertyOptional({ description: 'Filter banks by currency' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_url?: string;
}

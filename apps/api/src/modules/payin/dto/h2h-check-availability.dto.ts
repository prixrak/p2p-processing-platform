import { IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class H2hCheckAvailabilityDto {
  @ApiProperty({ description: 'Request ID (not persisted)' })
  @IsString()
  request_id!: string;

  @ApiProperty({ description: 'Amount to check availability for' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Currency code' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nonce?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_url?: string;
}

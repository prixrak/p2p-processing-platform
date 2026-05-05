import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePayoutPoolGlobalDto {
  @ApiPropertyOptional({ description: 'Global share routed to specialist pool B (0–100).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pool_b_global_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pool_timeout_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Hours unassigned STANDARD pool order waits before moving to pool B.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(8760)
  pool_timeout_hours?: number | null;

  @ApiPropertyOptional({
    description:
      'When true, Pay-Out specialists who fail an order return it to pool B (PENDING) without merchant refund.',
  })
  @IsOptional()
  @IsBoolean()
  specialist_fail_returns_to_pool?: boolean;
}

export class UpsertMerchantPayoutPoolAssignmentDto {
  @ApiProperty({
    description:
      'Merchant display name (`merchants.name`); must match exactly (case-sensitive).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  merchant_display_name!: string;

  @ApiProperty({ description: 'Per-merchant pool B share (0–100).' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pool_b_percent!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PatchMerchantPayoutPoolAssignmentDto {
  @ApiPropertyOptional({ description: 'Per-merchant pool B share (0–100).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pool_b_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  Max,
  Min,
  IsOptional,
} from 'class-validator';

export class UpdateCascadeSettingsDto {
  @ApiPropertyOptional({ description: 'Sliding window hours for traffic share correction' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  sliding_window_hours?: number;

  @ApiPropertyOptional({
    description: 'Fork autolimit activation threshold as fraction of remaining capacity (0–1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  autolimit_threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autolimit_enabled?: boolean;

  @ApiPropertyOptional({ description: 'CARD requisite rating multiplier (fill_ratio × weight)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  card_rating_weight?: number;

  @ApiPropertyOptional({ description: 'FORK requisite rating multiplier' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  fork_rating_weight?: number;
}

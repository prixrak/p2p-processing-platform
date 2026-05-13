import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, Max, Min, IsOptional } from 'class-validator';
import { CascadeLevelPickMode } from '@prisma/client';

export class UpdateCascadeSettingsDto {
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

  @ApiPropertyOptional({
    description:
      'Optional JSON array of { from, to, multiplier } for Fork fill multiplier ladder (confirmed fill ratio 0–1). Send null to clear and use code defaults.',
  })
  @IsOptional()
  fill_multipliers_config?: unknown | null;

  @ApiPropertyOptional({
    description: 'Fork tier target percent (0–100); saved values are normalized to sum 100 with Card/Provider',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fork_traffic_percent?: number;

  @ApiPropertyOptional({ description: 'Card tier target percent (0–100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  card_traffic_percent?: number;

  @ApiPropertyOptional({
    description: 'Provider tier target percent (0–100); external routing not implemented yet',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  provider_traffic_percent?: number;

  @ApiPropertyOptional({
    enum: CascadeLevelPickMode,
    description: 'DEBT = deterministic level credits; STOCHASTIC = weighted random primary tier',
  })
  @IsOptional()
  @IsEnum(CascadeLevelPickMode)
  level_pick_mode?: CascadeLevelPickMode;
}

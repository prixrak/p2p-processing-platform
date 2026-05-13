import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min, IsOptional } from 'class-validator';
import { TraderProcessingMethod } from '@prisma/client';

export class UpdateTraderCascadeDto {
  @ApiPropertyOptional({ enum: TraderProcessingMethod })
  @IsOptional()
  @IsEnum(TraderProcessingMethod)
  processing_method?: TraderProcessingMethod;

  @ApiPropertyOptional({
    description:
      'Idle-time race speed multiplier for this trader (1 = default). Applies within Fork/Card tiers (TZ v3.1).',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  cascade_rating_multiplier?: number;
}

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
      'Target traffic share among active traders with accepting orders enabled (0–100). The API rejects saves unless all such traders sum to 100% or all are 0 (equal split). See GET /api/admin/cascade/traffic-policy.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  traffic_percent?: number;
}

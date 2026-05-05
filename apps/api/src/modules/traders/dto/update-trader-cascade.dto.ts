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
      'Target traffic share among active traders with accepting orders enabled (0–100). Saves must keep that cohort at 100% total or all 0% (equal split). When PATCH applies to a member of that cohort, peer targets are adjusted automatically so the rule holds. See GET /api/admin/cascade/traffic-policy.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  traffic_percent?: number;
}

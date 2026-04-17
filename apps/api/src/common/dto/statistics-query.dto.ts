import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Shared query for time-windowed statistics (trader, merchant, etc.). */
export class StatisticsQueryDto {
  @ApiPropertyOptional({
    enum: ['24h', '7d', '30d', '90d'],
    description: 'Preset window. When set, overrides dateFrom/dateTo.',
  })
  @IsOptional()
  @IsIn(['24h', '7d', '30d', '90d'])
  period?: '24h' | '7d' | '30d' | '90d';

  @ApiPropertyOptional({ description: 'Start of range (ISO 8601). Used when period is omitted.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End of range (ISO 8601). Used when period is omitted.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

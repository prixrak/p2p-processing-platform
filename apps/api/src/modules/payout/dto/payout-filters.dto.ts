import { IsOptional, IsNumber, IsString, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_PAGE_SIZE } from '@p2p/shared';

export class PayoutListFiltersDto {
  @ApiPropertyOptional({
    enum: ['in_progress', 'history'],
    description:
      'Trader queue slice: in_progress (NEW, PROCESSING) or history (COMPLETED, FAILED, UPLOAD_FAILED).',
  })
  @IsOptional()
  @IsIn(['in_progress', 'history'])
  queue?: 'in_progress' | 'history';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

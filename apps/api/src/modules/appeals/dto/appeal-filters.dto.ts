import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppealStatus, MAX_PAGE_SIZE } from '@p2p/shared';
import { Type } from 'class-transformer';

export class AppealFiltersDto {
  @ApiPropertyOptional({ enum: AppealStatus })
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;

  @ApiPropertyOptional({ description: 'Filter by Pay-In order ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description:
      'Trader cabinet shorthand: open appeals (`current`) vs resolved/rejected (`history`). When set, ignores `status`.',
    enum: ['current', 'history'],
  })
  @IsOptional()
  @IsIn(['current', 'history'])
  listBucket?: 'current' | 'history';

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

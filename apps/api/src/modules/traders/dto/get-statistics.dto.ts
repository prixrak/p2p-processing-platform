import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { StatisticsQueryDto } from '../../../common/dto/statistics-query.dto';

export class GetStatisticsDto extends StatisticsQueryDto {
  @ApiPropertyOptional({
    description:
      'Fiat/order currency for volumes and counts (omit to infer from order activity in the window)',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{3,16}$/, { message: 'currency must be alphanumeric, 3–16 chars' })
  currency?: string;
}

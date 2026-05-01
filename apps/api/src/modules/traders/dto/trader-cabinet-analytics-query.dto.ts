import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { StatisticsQueryDto } from '../../../common/dto/statistics-query.dto';

export class TraderCabinetAnalyticsQueryDto extends StatisticsQueryDto {
  @ApiPropertyOptional({ description: 'Fiat/order currency filter (omit to infer from trader balances)' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{3,16}$/, { message: 'currency must be alphanumeric, 3–16 chars' })
  currency?: string;

  @ApiPropertyOptional({ enum: ['hour', 'day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsIn(['hour', 'day', 'week', 'month'])
  granularity?: 'hour' | 'day' | 'week' | 'month';

  @ApiPropertyOptional({
    enum: ['created', 'completed'],
    default: 'created',
    description:
      'Anchor date for filtering and bucketing: order creation (`created`) vs completion timestamps (`completed`)',
  })
  @IsOptional()
  @IsIn(['created', 'completed'])
  dateBasis?: 'created' | 'completed';
}

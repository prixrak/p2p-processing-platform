import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TraderCabinetAnalyticsSeriesItemDto {
  @ApiProperty({ description: 'Bucket start timestamp (UTC, ISO)' })
  periodStart: string;

  @ApiProperty()
  payInCount: number;

  @ApiProperty()
  payInAmount: number;

  @ApiProperty()
  payoutCount: number;

  @ApiProperty()
  payoutAmount: number;

  @ApiProperty()
  disputeCount: number;

  @ApiProperty()
  disputeAmount: number;

  @ApiProperty({
    description: 'Trader commission earnings in bucket (Pay-In PAID commission + Pay-Out COMPLETED commission)',
  })
  profitAmount: number;
}

export class TraderCabinetAnalyticsResponseDto {
  @ApiProperty()
  traderId: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ['hour', 'day', 'week', 'month'] })
  granularity: 'hour' | 'day' | 'week' | 'month';

  @ApiProperty({ enum: ['created', 'completed'] })
  dateBasis: 'created' | 'completed';

  @ApiPropertyOptional({ nullable: true })
  period: '24h' | '7d' | '30d' | '90d' | null;

  @ApiPropertyOptional({ nullable: true })
  dateFrom: string | null;

  @ApiPropertyOptional({ nullable: true })
  dateTo: string | null;

  @ApiProperty()
  cabinetProfitTotal: number;

  @ApiProperty({ type: [TraderCabinetAnalyticsSeriesItemDto] })
  series: TraderCabinetAnalyticsSeriesItemDto[];
}

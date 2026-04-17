import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VolumeByDayItemDto {
  @ApiProperty({ example: '2026-04-10' })
  date: string;

  @ApiProperty()
  payinVolume: number;

  @ApiProperty()
  payoutVolume: number;

  @ApiProperty()
  totalVolume: number;
}

export class OrdersByStatusDto {
  @ApiProperty({
    description: 'Pay-In status counts (lowercase keys, e.g. paid, canceled)',
    example: { paid: 10, canceled: 2 },
  })
  payIn: Record<string, number>;

  @ApiProperty({
    description: 'Pay-Out status counts (lowercase keys)',
    example: { completed: 5, failed: 1 },
  })
  payout: Record<string, number>;
}

export class TraderStatisticsResponseDto {
  @ApiProperty()
  traderId: string;

  @ApiProperty({
    description: 'Display currency for volumes (orders filtered to this currency)',
  })
  currency: string;

  @ApiPropertyOptional({ nullable: true })
  period: '24h' | '7d' | '30d' | '90d' | null;

  @ApiPropertyOptional({ nullable: true })
  dateFrom: string | null;

  @ApiPropertyOptional({ nullable: true })
  dateTo: string | null;

  @ApiProperty({ description: 'Sum of successful pay-in + pay-out amounts' })
  totalVolume: number;

  @ApiProperty()
  totalOrders: number;

  @ApiProperty()
  successfulOrders: number;

  @ApiProperty()
  canceledOrders: number;

  @ApiProperty()
  conversionRate: number;

  @ApiProperty({ type: [VolumeByDayItemDto] })
  volumeByDay: VolumeByDayItemDto[];

  @ApiProperty({ type: OrdersByStatusDto })
  ordersByStatus: OrdersByStatusDto;
}

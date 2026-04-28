import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTraderAcceptingOrdersDto {
  @ApiProperty({ description: 'When false, the trader stops receiving new Pay-In and Pay-Out assignments' })
  @IsBoolean()
  accepting_orders!: boolean;
}

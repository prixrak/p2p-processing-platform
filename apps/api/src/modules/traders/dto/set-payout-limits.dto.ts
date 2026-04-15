import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPayoutLimitsDto {
  @ApiProperty({
    description: 'Minimum payout order amount this trader can see in the pool (0 = no min limit)',
    example: 100,
  })
  @IsNumber()
  @Min(0)
  minLimit!: number;

  @ApiProperty({
    description: 'Maximum payout order amount this trader can see in the pool (0 = no max limit)',
    example: 20000,
  })
  @IsNumber()
  @Min(0)
  maxLimit!: number;
}

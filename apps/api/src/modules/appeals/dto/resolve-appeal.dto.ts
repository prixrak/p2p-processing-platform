import { IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppealStatus } from '@p2p/shared';

export class ResolveAppealDto {
  @ApiProperty({
    description: 'Decision: RESOLVED or REJECTED',
    enum: [AppealStatus.RESOLVED, AppealStatus.REJECTED],
  })
  @IsEnum(AppealStatus)
  decision!: AppealStatus;

  @ApiPropertyOptional({
    description:
      'Actual amount received when accepting (RESOLVED). If omitted, the payer-reported amount on the appeal is used.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  actualAmount?: number;
}

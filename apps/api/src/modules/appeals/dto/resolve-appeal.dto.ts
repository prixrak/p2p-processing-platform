import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AppealStatus } from '@p2p/shared';

export class ResolveAppealDto {
  @ApiProperty({
    description: 'Decision: RESOLVED or REJECTED',
    enum: [AppealStatus.RESOLVED, AppealStatus.REJECTED],
  })
  @IsEnum(AppealStatus)
  decision!: AppealStatus;
}

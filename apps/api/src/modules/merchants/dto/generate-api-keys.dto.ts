import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DirectionType } from '@p2p/shared';

export class GenerateApiKeysDto {
  @ApiProperty({ enum: DirectionType, description: 'PAYIN or PAYOUT' })
  @IsEnum(DirectionType)
  @IsNotEmpty()
  direction: DirectionType;
}

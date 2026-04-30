import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateTraderWalletDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  trader_id!: string;
}

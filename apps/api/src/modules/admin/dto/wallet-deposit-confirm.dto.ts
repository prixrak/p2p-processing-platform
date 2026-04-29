import { ApiProperty } from '@nestjs/swagger';
import { BlockchainNetwork } from '@prisma/client';
import { IsEnum, IsNumber, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Manual confirmation of an on-chain USDT deposit (until automated chain monitoring ships).
 */
export class WalletDepositConfirmDto {
  @ApiProperty()
  @IsUUID()
  trader_id!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  tx_hash!: string;

  @ApiProperty({ enum: BlockchainNetwork })
  @IsEnum(BlockchainNetwork)
  network!: BlockchainNetwork;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount_usdt!: number;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  confirmations!: number;
}

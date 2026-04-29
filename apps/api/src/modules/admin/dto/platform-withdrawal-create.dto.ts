import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BlockchainNetwork } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PlatformWithdrawalCreateDto {
  @ApiProperty({ example: 1250.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount_usdt!: number;

  @ApiProperty({ example: 'TXxx...', description: 'On-chain tx hash if already broadcast' })
  @IsString()
  @MaxLength(128)
  cold_wallet_address!: string;

  @ApiProperty({ enum: BlockchainNetwork })
  @IsEnum(BlockchainNetwork)
  network!: BlockchainNetwork;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  tx_hash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

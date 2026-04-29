import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateTraderBalanceModelDto {
  @ApiPropertyOptional({
    description: 'USDT overdraft limit (0 = disabled).',
    example: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1e12)
  overdraft_limit_usdt?: number;

  @ApiPropertyOptional({
    description: 'Pay-In rate as fraction (0.01 = +1% on parser divisor).',
    example: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(0.5)
  payin_rate?: number;

  @ApiPropertyOptional({
    description: 'Pay-Out rate as fraction (0.002 = 0.2%).',
    example: 0.002,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(0.5)
  payout_rate?: number;

  @ApiPropertyOptional({
    description: 'Tron TRC-20 address for USDT deposits (monitored by worker).',
    example: 'TXYZ...',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  @Matches(/^T[a-zA-Z0-9]{33}$/, {
    message: 'usdt_trc20_deposit_address must be a valid Tron base58 address',
  })
  usdt_trc20_deposit_address?: string;

  @ApiPropertyOptional({ description: 'Set true to remove the Tron deposit address.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  clear_trc20_deposit_address?: boolean;

  @ApiPropertyOptional({
    description: 'Ethereum mainnet ERC-20 address for USDT deposits (monitored by worker when ETH_RPC_URL is set).',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'usdt_erc20_deposit_address must be a valid 0x-prefixed Ethereum address',
  })
  usdt_erc20_deposit_address?: string;

  @ApiPropertyOptional({ description: 'Set true to remove the ERC-20 deposit address.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  clear_erc20_deposit_address?: boolean;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class TraderSelfErc20Dto {
  @ApiPropertyOptional({
    description: 'USDT ERC-20 deposit address (Ethereum mainnet). Omit both fields for no change.',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  @ValidateIf((o: TraderSelfErc20Dto) => !o.clear_erc20_deposit_address)
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'usdt_erc20_deposit_address must be a valid 0x-prefixed Ethereum address',
  })
  usdt_erc20_deposit_address?: string;

  @ApiPropertyOptional({ description: 'Clear the registered ERC-20 deposit address' })
  @IsOptional()
  @IsBoolean()
  clear_erc20_deposit_address?: boolean;
}

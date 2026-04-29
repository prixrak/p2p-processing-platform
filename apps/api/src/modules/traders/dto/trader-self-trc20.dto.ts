import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class TraderSelfTrc20Dto {
  @ApiPropertyOptional({
    description: 'USDT TRC-20 deposit address (Tron). Omit both fields for no change.',
  })
  @ValidateIf((o: TraderSelfTrc20Dto) => !o.clear_trc20_deposit_address)
  @IsOptional()
  @IsString()
  @MinLength(34)
  @MaxLength(64)
  usdt_trc20_deposit_address?: string;

  @ApiPropertyOptional({ description: 'Clear the registered deposit address' })
  @IsOptional()
  @IsBoolean()
  clear_trc20_deposit_address?: boolean;
}

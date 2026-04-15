import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCurrencyDto {
  @ApiPropertyOptional({ description: 'Whether the currency is available' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

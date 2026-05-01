import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDirectionDto {
  @ApiPropertyOptional({ description: 'Direction display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Source currency code' })
  @IsString()
  @IsOptional()
  fromCurrency?: string;

  @ApiPropertyOptional({ description: 'Target currency code' })
  @IsString()
  @IsOptional()
  toCurrency?: string;

  @ApiPropertyOptional({ description: 'Minimum order amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum order amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxAmount?: number;

  @ApiPropertyOptional({ description: 'Fee percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  percentFee?: number;
}

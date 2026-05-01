import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DirectionType } from '@p2p/shared';

export class CreateDirectionDto {
  @ApiProperty({ description: 'Direction display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: DirectionType, description: 'PAYIN or PAYOUT' })
  @IsEnum(DirectionType)
  @IsNotEmpty()
  type: DirectionType;

  @ApiProperty({ description: 'Source currency code' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ description: 'Target currency code' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

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

  @ApiPropertyOptional({ description: 'Is this direction online', default: true })
  @IsBoolean()
  @IsOptional()
  isOnline?: boolean;
}

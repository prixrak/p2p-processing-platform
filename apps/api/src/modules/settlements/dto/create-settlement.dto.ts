import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementType } from '@p2p/shared';

export class CreateSettlementDto {
  @ApiProperty({ description: 'Trader profile ID' })
  @IsUUID()
  @IsNotEmpty()
  traderId: string;

  @ApiProperty({ enum: SettlementType, description: 'CREDIT or DEBIT' })
  @IsEnum(SettlementType)
  @IsNotEmpty()
  type: SettlementType;

  @ApiProperty({ description: 'Settlement amount', minimum: 0.0001 })
  @IsNumber()
  @Min(0.0001)
  amount: number;

  @ApiProperty({ description: 'Currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ description: 'Admin note / reason' })
  @IsString()
  @IsOptional()
  note?: string;
}

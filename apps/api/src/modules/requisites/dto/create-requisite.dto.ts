import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequisiteType } from '@p2p/shared';

export class CreateRequisiteDto {
  @ApiProperty({ enum: RequisiteType })
  @IsEnum(RequisiteType)
  @IsNotEmpty()
  type: RequisiteType;

  @ApiProperty({ description: 'Card/IBAN number' })
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty({ description: 'Card/account owner name' })
  @IsString()
  @IsNotEmpty()
  owner: string;

  @ApiPropertyOptional({ description: 'Bank ID' })
  @IsInt()
  @IsOptional()
  bankId?: number;

  @ApiPropertyOptional({ description: 'Bank code (e.g. MFO, SWIFT)' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ description: 'Accept transfers from other banks' })
  @IsBoolean()
  @IsOptional()
  acceptsOtherBanks?: boolean;

  @ApiPropertyOptional({ description: 'Minimum accepted amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum accepted amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxAmount?: number;

  @ApiPropertyOptional({ description: 'Total amount limit' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  limitTotalAmount?: number;

  @ApiPropertyOptional({ description: 'Total operations limit' })
  @IsInt()
  @Min(0)
  @IsOptional()
  limitTotalOps?: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'UAH' })
  @IsString()
  @IsOptional()
  currency?: string;
}

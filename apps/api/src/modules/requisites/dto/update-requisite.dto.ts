import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRequisiteDto {
  @ApiPropertyOptional({ description: 'Card/account owner name' })
  @IsString()
  @IsOptional()
  owner?: string;

  @ApiPropertyOptional({
    description: 'Full legal name of the card/account holder (surname, given name, patronymic)',
  })
  @IsString()
  @IsOptional()
  cardHolderName?: string;

  @ApiPropertyOptional({ description: 'Bank code' })
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
}

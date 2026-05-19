import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequisiteType } from '@p2p/shared';

export class CreateRequisiteDto {
  @ApiProperty({ description: 'Parent requisite group (currency and pay-in routing come from the group)' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

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

  @ApiProperty({
    description: 'Full legal name of the card/account holder (surname, given name, patronymic)',
  })
  @IsString()
  @IsNotEmpty()
  cardHolderName: string;

  @ApiProperty({
    description:
      'Catalog bank ID (required for pay-in routing and merchant-visible bank lists)',
  })
  @IsInt()
  @Min(1)
  bankId: number;

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
}

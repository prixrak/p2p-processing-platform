import { IsString, IsNumber, Min, IsOptional, IsBoolean, IsUUID, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DirectionType } from '@prisma/client';

export class CommissionTierDto {
  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  amountFrom!: number;

  @ApiPropertyOptional({ example: 10000, description: 'null = no upper bound' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountTo?: number;

  @ApiProperty({ example: 1.5 })
  @IsNumber()
  @Min(0)
  commissionPercent!: number;
}

export class CreateMerchantDirectionDto {
  @ApiProperty({ enum: DirectionType })
  @IsEnum(DirectionType)
  directionType!: DirectionType;

  @ApiProperty({ example: 'UAH' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ example: 2.5, description: 'Default % when no tier matches' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultCommissionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ type: [CommissionTierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionTierDto)
  tiers?: CommissionTierDto[];
}

export class UpdateMerchantDirectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultCommissionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}

export class UpsertCommissionTiersDto {
  @ApiProperty({ type: [CommissionTierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionTierDto)
  tiers!: CommissionTierDto[];
}

export class CreateMerchantBlockedAmountDto {
  @ApiProperty({ example: 300, description: 'Exact order amount to reject' })
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiPropertyOptional({ example: 'Fraud pattern' })
  @IsOptional()
  @IsString()
  note?: string;
}

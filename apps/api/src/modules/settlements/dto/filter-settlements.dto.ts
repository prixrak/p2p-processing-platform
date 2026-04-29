import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  Min,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementType } from '@p2p/shared';

export class FilterSettlementsDto {
  @ApiPropertyOptional({ description: 'Filter by trader profile ID' })
  @IsUUID()
  @IsOptional()
  traderId?: string;

  @ApiPropertyOptional({ description: 'Filter by Pay-Out specialist profile ID' })
  @IsUUID()
  @IsOptional()
  payoutTraderId?: string;

  @ApiPropertyOptional({ description: 'Filter by merchant ID' })
  @IsUUID()
  @IsOptional()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Filter by recording admin ID' })
  @IsUUID()
  @IsOptional()
  adminId?: string;

  @ApiPropertyOptional({ enum: SettlementType })
  @IsEnum(SettlementType)
  @IsOptional()
  type?: SettlementType;

  @ApiPropertyOptional({ description: 'Filter by settlement currency code' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Minimum settlement principal amount (`amount`)' })
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum settlement principal amount (`amount`)' })
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;
}

import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementType } from '@p2p/shared';

export class FilterSettlementsDto {
  @ApiPropertyOptional({ description: 'Filter by trader ID' })
  @IsUUID()
  @IsOptional()
  traderId?: string;

  @ApiPropertyOptional({ description: 'Filter by admin ID' })
  @IsUUID()
  @IsOptional()
  adminId?: string;

  @ApiPropertyOptional({ enum: SettlementType })
  @IsEnum(SettlementType)
  @IsOptional()
  type?: SettlementType;

  @ApiPropertyOptional({ description: 'Filter by currency' })
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
}

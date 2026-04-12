import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMerchantDto {
  @ApiPropertyOptional({ description: 'Merchant display name' })
  @IsString()
  @IsOptional()
  name?: string;
}

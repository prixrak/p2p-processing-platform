import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBankDto {
  @ApiPropertyOptional({ description: 'Bank name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Logo file ID' })
  @IsUUID()
  @IsOptional()
  logoFileId?: string;
}

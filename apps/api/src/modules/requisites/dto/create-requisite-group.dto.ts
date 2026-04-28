import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRequisiteGroupDto {
  @ApiProperty({ description: 'Display name for this group of requisites' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'ISO currency code for all requisites in the group', example: 'UAH' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency: string;

  @ApiPropertyOptional({ description: 'Optional catalog payment method link' })
  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;
}

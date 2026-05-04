import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({
    description:
      'Catalog payment method ID (Pay-In routing and requisite-type rules; must match group currency)',
  })
  @IsUUID()
  @IsNotEmpty()
  paymentMethodId: string;
}

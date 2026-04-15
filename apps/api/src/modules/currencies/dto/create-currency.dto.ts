import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'USDT' })
  @IsString()
  @Length(2, 16)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'code must be alphanumeric' })
  code: string;
}

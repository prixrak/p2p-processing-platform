import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkUserDto {
  @ApiProperty({ description: 'UUID of the user to link to this referral agent' })
  @IsUUID()
  userId!: string;
}

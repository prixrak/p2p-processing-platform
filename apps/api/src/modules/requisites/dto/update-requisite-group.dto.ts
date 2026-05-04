import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRequisiteGroupDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Master switch: when false, starts inactivity timer toward archive' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Replace catalog payment method (must remain Pay-In capable and match group currency); omit to leave unchanged — cannot be cleared',
  })
  @IsUUID()
  @IsOptional()
  paymentMethodId?: string | null;
}

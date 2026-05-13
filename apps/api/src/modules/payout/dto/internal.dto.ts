import { IsString, IsOptional, IsUUID, ValidateIf, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutTraderRejectReason } from '@p2p/shared';

export class AssignToTraderDto {
  @ApiProperty({ description: 'Order UUID' })
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({ description: 'Standard trader profile UUID (pool A)' })
  @ValidateIf((o) => !o.payoutTraderId)
  @IsUUID()
  traderId?: string;

  @ApiPropertyOptional({ description: 'Pay-Out specialist profile UUID (pool B)' })
  @ValidateIf((o) => !o.traderId)
  @IsUUID()
  payoutTraderId?: string;
}

export class TraderFailDto {
  /** Optional alternate id in body; route path id is authoritative. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({
    description:
      'Rejection reason when the payout cannot be completed (inactive card / funds returned). Defaults to OTHER.',
    enum: PayoutTraderRejectReason,
  })
  @IsOptional()
  @IsEnum(PayoutTraderRejectReason)
  reason?: PayoutTraderRejectReason;

  @ApiPropertyOptional({
    description:
      'Required when rejecting with reason OTHER (including when `reason` is omitted). Plain-text explanation.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason_other_note?: string;
}

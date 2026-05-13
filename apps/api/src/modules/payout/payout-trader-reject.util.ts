import { PayoutTraderRejectReason } from '@p2p/shared';

/** Payload rejected by trader/specialist fail endpoint validation. */
export class PayoutTraderRejectPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoutTraderRejectPayloadError';
  }
}

export function resolvePayoutRejectReasonFromDto(
  code: PayoutTraderRejectReason | undefined,
): PayoutTraderRejectReason {
  if (code === PayoutTraderRejectReason.FOREIGN_CARD) {
    return PayoutTraderRejectReason.FOREIGN_CARD;
  }
  if (code === PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS) {
    return PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS;
  }
  return PayoutTraderRejectReason.OTHER;
}

export function parsePayoutTraderRejectBody(input: {
  reason?: PayoutTraderRejectReason;
  reason_other_note?: string;
}): { reason: PayoutTraderRejectReason; otherNote: string | null } {
  const reason = resolvePayoutRejectReasonFromDto(input.reason);
  const trimmed = input.reason_other_note?.trim() ?? '';
  if (reason === PayoutTraderRejectReason.OTHER) {
    if (!trimmed) {
      throw new PayoutTraderRejectPayloadError(
        'reason_other_note is required when rejecting with reason OTHER',
      );
    }
    return { reason, otherNote: trimmed };
  }
  return { reason, otherNote: null };
}

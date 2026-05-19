import { PayinNoRequisiteReason } from './enums';

export const PAYIN_NO_REQUISITE_REASON_VALUES = Object.values(
  PayinNoRequisiteReason,
) as PayinNoRequisiteReason[];

/** English owner-facing copy for application logs (one message per reason code). */
export const PAYIN_NO_REQUISITE_REASON_MESSAGES: Record<PayinNoRequisiteReason, string> = {
  [PayinNoRequisiteReason.NO_ACTIVE_REQUISITES]:
    'No active trader requisites are available for this currency.',
  [PayinNoRequisiteReason.REQUISITE_TOTAL_LIMIT_EXCEEDED]:
    'All active requisites have insufficient remaining total amount limit for this order amount.',
  [PayinNoRequisiteReason.NO_MATCHING_AMOUNT_OR_RANGE]:
    'Active requisites exist but none accept this amount (min/max, coverage grid, or autolimit bounds).',
  [PayinNoRequisiteReason.USDT_CAPACITY_INSUFFICIENT]:
    'Matching requisites exist but trader USDT balance (+ overdraft) cannot cover this Pay-In amount.',
  [PayinNoRequisiteReason.PROVIDER_DECLINED]:
    'External Pay-In provider declined the reservation after trader tiers had no assignable requisite.',
  [PayinNoRequisiteReason.PROVIDER_UNAVAILABLE]:
    'External Pay-In provider is disabled or unavailable.',
  [PayinNoRequisiteReason.ASSIGNMENT_CONTENTION]:
    'Requisites matched in cascade but could not be locked (limits, duplicate amount in flight, or concurrent assignment).',
};

const GENERIC_NO_REQUISITE_MESSAGE =
  'No active requisite matched this amount and currency.';

export function isPayinNoRequisiteReason(
  value: string | null | undefined,
): value is PayinNoRequisiteReason {
  return (
    value != null &&
    PAYIN_NO_REQUISITE_REASON_VALUES.includes(value as PayinNoRequisiteReason)
  );
}

export function payinNoRequisiteReasonMessage(
  reason: PayinNoRequisiteReason | string | null | undefined,
): string {
  if (isPayinNoRequisiteReason(reason)) {
    return PAYIN_NO_REQUISITE_REASON_MESSAGES[reason];
  }
  return GENERIC_NO_REQUISITE_MESSAGE;
}

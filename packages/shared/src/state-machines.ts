import { PayInOrderStatus, PayOutOrderStatus } from './enums';

export const PAYIN_TRANSITIONS: Record<PayInOrderStatus, PayInOrderStatus[]> = {
  [PayInOrderStatus.PENDING]: [
    PayInOrderStatus.NEW,
    PayInOrderStatus.UPLOAD_FAILED,
    // External provider tier: order may stay PENDING without a trader requisite until provider webhook settles.
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
    PayInOrderStatus.CANCELED,
  ],
  [PayInOrderStatus.NEW]: [
    PayInOrderStatus.VERIFIED,
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
    PayInOrderStatus.CANCELED,
    PayInOrderStatus.APPEAL,
  ],
  [PayInOrderStatus.VERIFIED]: [
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
    PayInOrderStatus.CANCELED,
  ],
  [PayInOrderStatus.PAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.UNDERPAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.OVERPAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.CANCELED]: [
    PayInOrderStatus.APPEAL,
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
  ],
  [PayInOrderStatus.APPEAL]: [
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
    PayInOrderStatus.CANCELED,
  ],
  [PayInOrderStatus.UPLOAD_FAILED]: [],
  [PayInOrderStatus.NO_REQUISITE]: [PayInOrderStatus.CANCELED],
};

export const PAYOUT_TRANSITIONS: Record<PayOutOrderStatus, PayOutOrderStatus[]> = {
  // PROCESSING: Pay-Out specialist may take pool orders directly into active processing (PDF cabinet).
  [PayOutOrderStatus.PENDING]: [
    PayOutOrderStatus.NEW,
    PayOutOrderStatus.UPLOAD_FAILED,
    PayOutOrderStatus.PROCESSING,
  ],
  // NEW → PENDING: system returns an assigned pool-A order to the shared queue (e.g. trader profile disabled).
  [PayOutOrderStatus.NEW]: [PayOutOrderStatus.PROCESSING, PayOutOrderStatus.PENDING],
  // PENDING: specialist “fail” can return a pool B order to the shared queue (config-driven).
  [PayOutOrderStatus.PROCESSING]: [
    PayOutOrderStatus.COMPLETED,
    PayOutOrderStatus.FAILED,
    PayOutOrderStatus.PENDING,
  ],
  [PayOutOrderStatus.COMPLETED]: [],
  [PayOutOrderStatus.FAILED]: [],
  [PayOutOrderStatus.UPLOAD_FAILED]: [],
};

export function isValidPayInTransition(
  from: PayInOrderStatus,
  to: PayInOrderStatus,
): boolean {
  return PAYIN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidPayOutTransition(
  from: PayOutOrderStatus,
  to: PayOutOrderStatus,
): boolean {
  return PAYOUT_TRANSITIONS[from]?.includes(to) ?? false;
}

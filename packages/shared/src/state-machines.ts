import { PayInOrderStatus, PayOutOrderStatus } from './enums';

export const PAYIN_TRANSITIONS: Record<PayInOrderStatus, PayInOrderStatus[]> = {
  [PayInOrderStatus.PENDING]: [PayInOrderStatus.NEW, PayInOrderStatus.UPLOAD_FAILED],
  [PayInOrderStatus.NEW]: [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED],
  [PayInOrderStatus.VERIFIED]: [
    PayInOrderStatus.PAID,
    PayInOrderStatus.UNDERPAID,
    PayInOrderStatus.OVERPAID,
    PayInOrderStatus.CANCELED,
  ],
  [PayInOrderStatus.PAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.UNDERPAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.OVERPAID]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.CANCELED]: [PayInOrderStatus.APPEAL],
  [PayInOrderStatus.APPEAL]: [],
  [PayInOrderStatus.UPLOAD_FAILED]: [],
};

export const PAYOUT_TRANSITIONS: Record<PayOutOrderStatus, PayOutOrderStatus[]> = {
  [PayOutOrderStatus.PENDING]: [PayOutOrderStatus.NEW, PayOutOrderStatus.UPLOAD_FAILED],
  [PayOutOrderStatus.NEW]: [PayOutOrderStatus.PROCESSING],
  [PayOutOrderStatus.PROCESSING]: [PayOutOrderStatus.COMPLETED, PayOutOrderStatus.FAILED],
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

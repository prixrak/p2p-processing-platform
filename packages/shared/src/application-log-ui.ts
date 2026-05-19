import {
  PayInOrderStatus,
  PayOutOrderStatus,
  PayinNoRequisiteReason,
  PayoutTraderRejectReason,
} from './enums';
import {
  PAYIN_NO_REQUISITE_REASON_VALUES,
  payinNoRequisiteReasonMessage,
} from './payin-no-requisite';

/** Application Logs screen buckets (TZ §3). */
export enum ApplicationLogUiStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  PENDING = 'PENDING',
}

export type ApplicationLogKind = 'PAYIN' | 'PAYOUT';

/** Normalized error codes for filters and API responses (English semantics). */
export const APPLICATION_LOG_PAYIN_ERROR_CODES = [
  'NO_REQUISITE',
  'UPLOAD_FAILED',
  ...PAYIN_NO_REQUISITE_REASON_VALUES,
] as const;
export type ApplicationLogPayinErrorCode = (typeof APPLICATION_LOG_PAYIN_ERROR_CODES)[number];

export const APPLICATION_LOG_PAYOUT_ERROR_CODES = [
  'FAILED',
  'UPLOAD_FAILED',
  'FOREIGN_CARD',
  'CARD_REFUND_IN_PROGRESS',
  'OTHER',
] as const;
export type ApplicationLogPayoutErrorCode = (typeof APPLICATION_LOG_PAYOUT_ERROR_CODES)[number];

export type ApplicationLogErrorCode =
  | ApplicationLogPayinErrorCode
  | ApplicationLogPayoutErrorCode;

export function mapPayinToApplicationLogUiStatus(
  status: PayInOrderStatus | string,
  traderId: string | null | undefined,
): ApplicationLogUiStatus {
  const s = typeof status === 'string' ? status : String(status);
  if (s === PayInOrderStatus.NO_REQUISITE || s === PayInOrderStatus.UPLOAD_FAILED) {
    return ApplicationLogUiStatus.ERROR;
  }
  if (traderId != null) {
    return ApplicationLogUiStatus.SUCCESS;
  }
  return ApplicationLogUiStatus.PENDING;
}

export function mapPayoutToApplicationLogUiStatus(
  status: PayOutOrderStatus | string,
): ApplicationLogUiStatus {
  const s = typeof status === 'string' ? status : String(status);
  if (s === PayOutOrderStatus.COMPLETED) {
    return ApplicationLogUiStatus.SUCCESS;
  }
  if (s === PayOutOrderStatus.FAILED || s === PayOutOrderStatus.UPLOAD_FAILED) {
    return ApplicationLogUiStatus.ERROR;
  }
  return ApplicationLogUiStatus.PENDING;
}

export function resolvePayinApplicationLogErrorCode(
  status: PayInOrderStatus | string,
  noRequisiteReason?: PayinNoRequisiteReason | string | null,
): ApplicationLogPayinErrorCode | null {
  const s = typeof status === 'string' ? status : String(status);
  if (s === PayInOrderStatus.NO_REQUISITE) {
    if (
      noRequisiteReason &&
      PAYIN_NO_REQUISITE_REASON_VALUES.includes(noRequisiteReason as PayinNoRequisiteReason)
    ) {
      return noRequisiteReason as PayinNoRequisiteReason;
    }
    return 'NO_REQUISITE';
  }
  if (s === PayInOrderStatus.UPLOAD_FAILED) return 'UPLOAD_FAILED';
  return null;
}

export function resolvePayoutApplicationLogErrorCode(
  status: PayOutOrderStatus | string,
  traderRejectReason: PayoutTraderRejectReason | string | null | undefined,
): ApplicationLogPayoutErrorCode | null {
  const s = typeof status === 'string' ? status : String(status);
  if (s === PayOutOrderStatus.UPLOAD_FAILED) return 'UPLOAD_FAILED';
  if (s === PayOutOrderStatus.FAILED) {
    const r = traderRejectReason ? String(traderRejectReason) : '';
    if (r === PayoutTraderRejectReason.FOREIGN_CARD) return 'FOREIGN_CARD';
    if (r === PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS) return 'CARD_REFUND_IN_PROGRESS';
    if (r === PayoutTraderRejectReason.OTHER) return 'OTHER';
    return 'FAILED';
  }
  return null;
}

export function applicationLogErrorMessage(
  kind: ApplicationLogKind,
  status: PayInOrderStatus | PayOutOrderStatus | string,
  traderRejectReason?: PayoutTraderRejectReason | string | null,
  noRequisiteReason?: PayinNoRequisiteReason | string | null,
): string | null {
  if (kind === 'PAYIN') {
    const s = typeof status === 'string' ? status : String(status);
    if (s === PayInOrderStatus.NO_REQUISITE) {
      return payinNoRequisiteReasonMessage(noRequisiteReason);
    }
    if (s === PayInOrderStatus.UPLOAD_FAILED) {
      return PAYIN_UPLOAD_FAILED_MESSAGE;
    }
    return null;
  }
  const code = resolvePayoutApplicationLogErrorCode(status, traderRejectReason ?? null);
  if (!code) return null;
  return PAYOUT_ERROR_MESSAGES[code];
}

const PAYIN_UPLOAD_FAILED_MESSAGE =
  'Pay-In upload failed before the order could be accepted.';

const PAYOUT_ERROR_MESSAGES: Record<ApplicationLogPayoutErrorCode, string> = {
  FAILED: 'Pay-Out did not complete.',
  UPLOAD_FAILED: 'Pay-Out upload failed before processing.',
  FOREIGN_CARD: 'Rejected: foreign card / unsupported card region.',
  CARD_REFUND_IN_PROGRESS: 'Rejected: refund or chargeback in progress on the card.',
  OTHER: 'Rejected by processor or trader (other reason).',
};

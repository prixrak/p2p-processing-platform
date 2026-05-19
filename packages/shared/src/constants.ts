import { PayInOrderStatus, PayOutOrderStatus } from './enums';

export const NONCE_VALIDITY_SECONDS = 300; // 5 minutes
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_FILE_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'application/pdf'];
/** Max files per multipart upload for merchant proofs and internal batch upload (`POST /files/upload/batch`). */
export const MAX_MULTIPART_FILES_PER_REQUEST = 10;
/** Max completion receipt files stored on a single Pay-Out order (trader / specialist cabinet). */
export const MAX_PAYOUT_COMPLETION_PROOF_FILES = MAX_MULTIPART_FILES_PER_REQUEST;
export const WEBHOOK_MAX_RETRIES = 8;
export const WEBHOOK_RETRY_DELAYS_MS = [
  5_000,      // 5s
  30_000,     // 30s
  120_000,    // 2m
  600_000,    // 10m
  3_600_000,  // 1h
  3_600_000,  // 1h
  3_600_000,  // 1h
  3_600_000,  // 1h
];
export const MAX_PAGE_SIZE = 100;

/** Pay-In orders still in the trader workflow (not settled, closed, or awaiting appeal resolution). */
export const PAYIN_TRADER_CURRENT_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PENDING,
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
  PayInOrderStatus.APPEAL,
];

/** Pay-In orders that left the active workflow (paid variants, canceled, or upload failure). */
export const PAYIN_TRADER_HISTORY_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PAID,
  PayInOrderStatus.UNDERPAID,
  PayInOrderStatus.OVERPAID,
  PayInOrderStatus.CANCELED,
  PayInOrderStatus.UPLOAD_FAILED,
  PayInOrderStatus.NO_REQUISITE,
];

/** Merchant-paid terminal outcomes — drive requisite confirmed_payin_amount for cascade fill (TZ §3.4). */
export const PAYIN_PAID_OUTCOME_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PAID,
  PayInOrderStatus.UNDERPAID,
  PayInOrderStatus.OVERPAID,
];

/** Pay-Out orders the trader took from the pool and is still working on. */
export const PAYOUT_TRADER_IN_PROGRESS_STATUSES: readonly PayOutOrderStatus[] = [
  PayOutOrderStatus.NEW,
  PayOutOrderStatus.PROCESSING,
];

/** Pay-Out orders finished (paid out) or closed as failed / upload error. */
export const PAYOUT_TRADER_HISTORY_STATUSES: readonly PayOutOrderStatus[] = [
  PayOutOrderStatus.COMPLETED,
  PayOutOrderStatus.FAILED,
  PayOutOrderStatus.UPLOAD_FAILED,
];

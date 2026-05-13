import { PayInOrderStatus } from './enums';

/**
 * Pay-in orders that still reserve requisite capacity (not PAID, not released by cancel).
 */
export const PAYIN_IN_FLIGHT_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PENDING,
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
  PayInOrderStatus.UNDERPAID,
  PayInOrderStatus.OVERPAID,
  PayInOrderStatus.APPEAL,
] as const;

/**
 * Active processing pipeline only — used for requisite volume "in processing" (orange).
 * Excludes UNDERPAID/OVERPAID so they count as completed (green) together with PAID.
 */
export const PAYIN_PIPELINE_IN_FLIGHT_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PENDING,
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
  PayInOrderStatus.APPEAL,
] as const;

/**
 * Confirmed trader-side outcomes that keep a reserved requisite operation/amount slot.
 * Matches how traders interpret "completed" vs cascade `used_ops` / assignments.
 */
export const PAYIN_REQUISITE_COMPLETED_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PAID,
  PayInOrderStatus.UNDERPAID,
  PayInOrderStatus.OVERPAID,
] as const;

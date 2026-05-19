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
 * Pay-In rows on a requisite that block assigning another order with the same fiat amount.
 * Prevents ambiguous incoming-payment matching for traders (same amount, same card).
 * Only trader-assigned matching states (NEW / VERIFIED); PENDING and APPEAL do not block.
 */
export const PAYIN_REQUISITE_SAME_AMOUNT_BLOCKING_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
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

/**
 * Pay-In statuses that still hold requisite reservation (`used_amount` / `used_ops`) because
 * `releaseUsage` runs on CANCEL (and similar) only — not when moving to paid-like outcomes.
 * Used for requisite volume breakdown so UI sums match platform counters for every non-terminal
 * outcome except completed (e.g. includes {@link PayInOrderStatus.UPLOAD_FAILED}).
 */
export const PAYIN_REQUISITE_NONCOMPLETED_STATUSES: readonly PayInOrderStatus[] = (
  Object.values(PayInOrderStatus) as PayInOrderStatus[]
).filter(
  (s) =>
    s !== PayInOrderStatus.CANCELED &&
    !(PAYIN_REQUISITE_COMPLETED_STATUSES as readonly PayInOrderStatus[]).includes(s),
);

/**
 * Pay-In rows where a trader is liable for the eventual USDT debit but `creditBalancesOnPaid` has
 * not run yet (same boundary as payin.service `applyPayinPaidTransitionTx` when entering PAID-like outcomes).
 * Used to reserve USDT headroom during cascade assignment so balance + overdraft is not exceeded
 * after queued NEW/VERIFIED orders confirm.
 */
export const PAYIN_PRE_USDT_SETTLEMENT_STATUSES: readonly PayInOrderStatus[] = [
  PayInOrderStatus.PENDING,
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
] as const;

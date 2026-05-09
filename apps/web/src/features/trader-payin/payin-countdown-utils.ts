import { PayInOrderStatus } from '@p2p/shared';

const AUTOCLOSE_PENDING_STATUSES = new Set([
  PayInOrderStatus.NEW,
  PayInOrderStatus.PENDING,
]);

/**
 * When the Pay-In deadline (`autocloseAt`) has passed, the UI matches the domain:
 * auto-close sets CANCELED for NEW/PENDING; show "Canceled" for those (or when already CANCELED).
 * Other statuses keep a numeric 0:00 countdown style until the state machine changes them.
 */
export function payinDeadlineElapsedShowsCanceled(opts: {
  remainingMs: number;
  status?: PayInOrderStatus;
}): boolean {
  const { remainingMs, status } = opts;
  if (status === PayInOrderStatus.CANCELED) return true;
  if (remainingMs > 0) return false;
  if (status === undefined) return true;
  return AUTOCLOSE_PENDING_STATUSES.has(status);
}

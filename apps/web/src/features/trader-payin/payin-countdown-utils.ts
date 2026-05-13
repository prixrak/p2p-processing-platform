import { PayInOrderStatus } from '@p2p/shared';

/**
 * Use explicit "Canceled" timer styling only when the order is actually canceled.
 * After `autocloseAt`, NEW/PENDING orders stay active and keep reserving the requisite;
 * the trader UI shows 0:00 in the overdue (red) style instead of the canceled label.
 */
export function payinDeadlineElapsedShowsCanceled(status?: PayInOrderStatus): boolean {
  return status === PayInOrderStatus.CANCELED;
}

import { PAYIN_TRADER_HISTORY_STATUSES, type PayInOrderStatus } from '@p2p/shared';

const PAYIN_TRADER_HISTORY = new Set<PayInOrderStatus>(PAYIN_TRADER_HISTORY_STATUSES);

/** Persist completion instant when a Pay-In order enters a trader history bucket status. */
export function payinCompletedAtForHistoryStatus(
  nextStatus: PayInOrderStatus,
  at: Date = new Date(),
): { completedAt: Date } | Record<string, never> {
  return PAYIN_TRADER_HISTORY.has(nextStatus) ? { completedAt: at } : {};
}

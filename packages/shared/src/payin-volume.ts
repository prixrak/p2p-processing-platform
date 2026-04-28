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

import { DirectionType } from './enums';

/** Query param `direction` and JSON fields (`type`, API key `direction`) in merchant/admin cabinets. */
export const ORDER_LIST_DIRECTION = {
  PAY_IN: 'PAY_IN',
  PAY_OUT: 'PAY_OUT',
} as const;

export type OrderListDirection = (typeof ORDER_LIST_DIRECTION)[keyof typeof ORDER_LIST_DIRECTION];

/** Tab keys on order list pages (Pay-In / Pay-Out). */
export const ORDER_LIST_UI_TAB = {
  PAY_IN: 'pay-in',
  PAY_OUT: 'pay-out',
} as const;

export type OrderListUiTab = (typeof ORDER_LIST_UI_TAB)[keyof typeof ORDER_LIST_UI_TAB];

export function orderListUiTabToDirection(tab: OrderListUiTab): OrderListDirection {
  return tab === ORDER_LIST_UI_TAB.PAY_IN
    ? ORDER_LIST_DIRECTION.PAY_IN
    : ORDER_LIST_DIRECTION.PAY_OUT;
}

export function isOrderListPayOutTab(tab: string): tab is typeof ORDER_LIST_UI_TAB.PAY_OUT {
  return tab === ORDER_LIST_UI_TAB.PAY_OUT;
}

/** Maps shared `DirectionType` or Prisma `ApiKeyDirection` (both `PAYIN` / `PAYOUT`). */
export function directionTypeToOrderListDirection(
  dt: DirectionType | 'PAYIN' | 'PAYOUT',
): OrderListDirection {
  const s = dt as string;
  return s === DirectionType.PAYIN ? ORDER_LIST_DIRECTION.PAY_IN : ORDER_LIST_DIRECTION.PAY_OUT;
}

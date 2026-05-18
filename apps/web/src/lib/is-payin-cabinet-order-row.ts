import { DirectionType, ORDER_LIST_DIRECTION } from '@p2p/shared';

/** Pay-In row in merged admin/support/owner/merchant order lists (`type` varies by endpoint). */
export function isPayinCabinetOrderRow(row: { type: string }): boolean {
  const t = row.type;
  return (
    t === DirectionType.PAYIN ||
    t === 'PAYIN' ||
    t === ORDER_LIST_DIRECTION.PAY_IN ||
    t === 'pay-in'
  );
}

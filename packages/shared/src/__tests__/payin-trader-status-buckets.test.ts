import { PayInOrderStatus } from '../enums';
import { PAYIN_TRADER_CURRENT_STATUSES, PAYIN_TRADER_HISTORY_STATUSES } from '../constants';

describe('Pay-In trader list status buckets', () => {
  it('keeps current and history disjoint and covers every PayInOrderStatus', () => {
    const overlap = PAYIN_TRADER_CURRENT_STATUSES.filter((s) =>
      PAYIN_TRADER_HISTORY_STATUSES.includes(s),
    );
    expect(overlap).toEqual([]);

    const union = new Set([...PAYIN_TRADER_CURRENT_STATUSES, ...PAYIN_TRADER_HISTORY_STATUSES]);
    const all = new Set(Object.values(PayInOrderStatus));
    expect(union).toEqual(all);
  });

  it('keeps unresolved appeals in the current bucket', () => {
    expect(PAYIN_TRADER_CURRENT_STATUSES).toContain(PayInOrderStatus.APPEAL);
    expect(PAYIN_TRADER_HISTORY_STATUSES).not.toContain(PayInOrderStatus.APPEAL);
  });
});

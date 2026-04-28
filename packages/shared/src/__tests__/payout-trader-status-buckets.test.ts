import { PayOutOrderStatus } from '../enums';
import {
  PAYOUT_TRADER_IN_PROGRESS_STATUSES,
  PAYOUT_TRADER_HISTORY_STATUSES,
} from '../constants';

describe('Pay-Out trader list status buckets', () => {
  it('keeps in-progress and history disjoint and, with PENDING (pool), covers every PayOutOrderStatus', () => {
    const overlap = PAYOUT_TRADER_IN_PROGRESS_STATUSES.filter((s) =>
      PAYOUT_TRADER_HISTORY_STATUSES.includes(s),
    );
    expect(overlap).toEqual([]);

    const union = new Set([
      PayOutOrderStatus.PENDING,
      ...PAYOUT_TRADER_IN_PROGRESS_STATUSES,
      ...PAYOUT_TRADER_HISTORY_STATUSES,
    ]);
    const all = new Set(Object.values(PayOutOrderStatus));
    expect(union).toEqual(all);
  });
});

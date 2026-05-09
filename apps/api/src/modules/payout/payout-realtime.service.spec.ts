import {
  payoutMerchantChannel,
  payoutOrderChannel,
  payoutPoolChannel,
  payoutStaffBroadcastChannel,
  payoutTraderChannel,
  payoutSpecialistChannel,
} from './payout-realtime.service';

describe('PayoutRealtimeService channel helpers', () => {
  it('builds stable order, trader, specialist, pool, and merchant channel names', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(payoutOrderChannel(id)).toBe(`payout:order:${id}`);
    expect(payoutTraderChannel(id)).toBe(`payout:trader:${id}`);
    expect(payoutSpecialistChannel(id)).toBe(`payout:specialist:${id}`);
    expect(payoutPoolChannel()).toBe('payout:pool');
    expect(payoutMerchantChannel(id)).toBe(`payout:merchant:${id}`);
    expect(payoutStaffBroadcastChannel()).toBe('payout:staff');
  });
});

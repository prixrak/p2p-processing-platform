import {
  payinMerchantChannel,
  payinOrderChannel,
  payinStaffBroadcastChannel,
  payinTraderChannel,
} from './payin-realtime.service';

describe('PayinRealtimeService channel helpers', () => {
  it('builds stable order, trader, and merchant channel names', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(payinOrderChannel(id)).toBe(`payin:order:${id}`);
    expect(payinTraderChannel(id)).toBe(`payin:trader:${id}`);
    expect(payinMerchantChannel(id)).toBe(`payin:merchant:${id}`);
    expect(payinStaffBroadcastChannel()).toBe('payin:staff');
  });
});

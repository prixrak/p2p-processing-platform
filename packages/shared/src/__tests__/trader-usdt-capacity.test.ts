import { computeTraderUsdtCapacity } from '../trader-usdt-capacity';

describe('computeTraderUsdtCapacity', () => {
  it('treats balance + overdraft as gross and subtracts pending debits for effective headroom', () => {
    const snap = computeTraderUsdtCapacity({
      balanceUsdt: 50,
      overdraftLimitUsdt: 100,
      pendingPayinDebitUsdt: 40,
      lowCapacityThresholdUsdt: 200,
    });
    expect(snap.grossAvailableUsdt).toBe(150);
    expect(snap.effectiveAvailableUsdt).toBe(110);
    expect(snap.payinCapacityExhausted).toBe(false);
    expect(snap.lowPayinCapacityAlert).toBe(true);
  });

  it('flags exhausted when effective headroom is zero or negative', () => {
    const snap = computeTraderUsdtCapacity({
      balanceUsdt: -80,
      overdraftLimitUsdt: 100,
      pendingPayinDebitUsdt: 25,
      lowCapacityThresholdUsdt: 50,
    });
    expect(snap.effectiveAvailableUsdt).toBe(-5);
    expect(snap.payinCapacityExhausted).toBe(true);
    expect(snap.lowPayinCapacityAlert).toBe(true);
  });
});

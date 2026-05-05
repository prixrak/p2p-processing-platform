import { BadRequestException } from '@nestjs/common';
import {
  computeCascadeTrafficPercentRebalance,
  computeExistingCohortTrafficBeforeNewTrader,
  isValidCascadeTrafficPercentTotal,
  isValidEthereumUsdtDepositAddress,
  isValidTronTrc20Address,
} from './traders.service';

describe('isValidTronTrc20Address', () => {
  it('accepts standard Tron base58 address', () => {
    expect(isValidTronTrc20Address('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true);
  });

  it('rejects invalid length or charset', () => {
    expect(isValidTronTrc20Address('0x1234')).toBe(false);
    expect(isValidTronTrc20Address('T')).toBe(false);
    expect(isValidTronTrc20Address('')).toBe(false);
  });
});

describe('isValidCascadeTrafficPercentTotal', () => {
  it('accepts totals near 100% or all-zero', () => {
    expect(isValidCascadeTrafficPercentTotal(100)).toBe(true);
    expect(isValidCascadeTrafficPercentTotal(99.99)).toBe(true);
    expect(isValidCascadeTrafficPercentTotal(0)).toBe(true);
  });

  it('rejects partial totals that cascade cannot treat as intentional', () => {
    expect(isValidCascadeTrafficPercentTotal(50)).toBe(false);
    expect(isValidCascadeTrafficPercentTotal(99)).toBe(false);
    expect(isValidCascadeTrafficPercentTotal(0.5)).toBe(false);
  });
});

describe('computeCascadeTrafficPercentRebalance', () => {
  it('gives the remainder to the other trader when two peers', () => {
    const cohort = [
      { id: 'a', trafficPercent: 50 },
      { id: 'b', trafficPercent: 50 },
    ];
    const m = computeCascadeTrafficPercentRebalance(cohort, 'a', 60);
    expect(m.get('a')).toBe(60);
    expect(m.get('b')).toBe(40);
  });

  it('keeps all-zero when the cohort was already all-zero', () => {
    const cohort = [
      { id: 'a', trafficPercent: 0 },
      { id: 'b', trafficPercent: 0 },
    ];
    const m = computeCascadeTrafficPercentRebalance(cohort, 'a', 0);
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(0);
  });

  it('splits remainder equally when peers had no weight', () => {
    const cohort = [
      { id: 'a', trafficPercent: 0 },
      { id: 'b', trafficPercent: 0 },
    ];
    const m = computeCascadeTrafficPercentRebalance(cohort, 'a', 50);
    expect(m.get('a')).toBe(50);
    expect(m.get('b')).toBe(50);
  });

  it('preserves relative weights among non-primary peers', () => {
    const cohort = [
      { id: 'a', trafficPercent: 30 },
      { id: 'b', trafficPercent: 30 },
      { id: 'c', trafficPercent: 40 },
    ];
    const m = computeCascadeTrafficPercentRebalance(cohort, 'a', 10);
    expect(m.get('a')).toBe(10);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100) <= 0.02).toBe(true);
    expect(m.get('b')).toBeCloseTo(90 * (30 / 70), 4);
    expect(m.get('c')).toBeCloseTo(90 * (40 / 70), 4);
  });

  it('rejects non-0/100 targets for the sole active accepting trader', () => {
    const cohort = [{ id: 'solo', trafficPercent: 100 }];
    expect(() => computeCascadeTrafficPercentRebalance(cohort, 'solo', 50)).toThrow(
      BadRequestException,
    );
  });
});

describe('computeExistingCohortTrafficBeforeNewTrader', () => {
  it('scales existing traders down when new one takes a slice (100% baseline)', () => {
    const cohort = [
      { id: 'a', trafficPercent: 50 },
      { id: 'b', trafficPercent: 50 },
    ];
    const m = computeExistingCohortTrafficBeforeNewTrader(cohort, 30);
    expect(m.get('a')).toBe(35);
    expect(m.get('b')).toBe(35);
  });

  it('splits remainder equally when existing weights are zero', () => {
    const cohort = [
      { id: 'a', trafficPercent: 0 },
      { id: 'b', trafficPercent: 0 },
    ];
    const m = computeExistingCohortTrafficBeforeNewTrader(cohort, 40);
    expect(m.get('a')).toBe(30);
    expect(m.get('b')).toBe(30);
  });

  it('keeps no updates when first trader uses valid 0 or 100 targets', () => {
    expect(computeExistingCohortTrafficBeforeNewTrader([], 100).size).toBe(0);
    expect(computeExistingCohortTrafficBeforeNewTrader([], 0).size).toBe(0);
  });

  it('rejects invalid first-trader target', () => {
    expect(() => computeExistingCohortTrafficBeforeNewTrader([], 30)).toThrow(BadRequestException);
  });

  it('keeps everyone at zero when cohort and new target are all zero', () => {
    const cohort = [
      { id: 'a', trafficPercent: 0 },
      { id: 'b', trafficPercent: 0 },
    ];
    const m = computeExistingCohortTrafficBeforeNewTrader(cohort, 0);
    expect(m.size).toBe(0);
  });
});

describe('isValidEthereumUsdtDepositAddress', () => {
  it('accepts 20-byte hex address', () => {
    expect(isValidEthereumUsdtDepositAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(
      true,
    );
  });

  it('rejects Tron or short hex', () => {
    expect(isValidEthereumUsdtDepositAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(false);
    expect(isValidEthereumUsdtDepositAddress('0x1234')).toBe(false);
    expect(isValidEthereumUsdtDepositAddress('')).toBe(false);
  });
});

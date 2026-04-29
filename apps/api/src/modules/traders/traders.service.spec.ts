import {
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

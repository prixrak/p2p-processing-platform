import { describe, expect, it } from 'vitest';
import {
  currencyCodeFromBalanceRow,
  ledgerAmountForCurrency,
  maxUsdtDebitAllowed,
  normalizeTraderApiProfileForSettlement,
} from './settlement-trader-ledger';

describe('settlement-trader-ledger', () => {
  it('normalizes nested currency.code and sorts rows', () => {
    const snap = normalizeTraderApiProfileForSettlement({
      overdraftLimit: 100,
      balances: [
        { currency: { code: 'UAH' }, amount: '500' },
        { currency: { code: 'USDT' }, amount: 50.25 },
      ],
    });
    expect(snap.overdraftLimitUsdt).toBe(100);
    expect(snap.rows).toEqual([
      { currency: 'UAH', ledger: 500 },
      { currency: 'USDT', ledger: 50.25 },
    ]);
  });

  it('normalizes flat currency string rows', () => {
    const snap = normalizeTraderApiProfileForSettlement({
      overdraftLimit: 0,
      balances: [{ currency: 'USDT', amount: '10' }],
    });
    expect(snap.rows).toEqual([{ currency: 'USDT', ledger: 10 }]);
  });

  it('drops rows with missing currency', () => {
    const snap = normalizeTraderApiProfileForSettlement({
      balances: [{ currency: {}, amount: 1 } as { currency: unknown; amount: unknown }],
    });
    expect(snap.rows).toEqual([]);
  });

  it('maxUsdtDebitAllowed matches ledger plus overdraft', () => {
    expect(maxUsdtDebitAllowed(200, 50)).toBe(250);
    expect(maxUsdtDebitAllowed(-30, 100)).toBe(70);
  });

  it('ledgerAmountForCurrency returns 0 when missing', () => {
    expect(ledgerAmountForCurrency([{ currency: 'UAH', ledger: 1 }], 'USDT')).toBe(0);
  });

  it('currencyCodeFromBalanceRow handles string', () => {
    expect(currencyCodeFromBalanceRow({ currency: 'EUR', amount: 0 })).toBe('EUR');
  });
});

import {
  creditFiatMerchantPayin,
  debitUsdtPayin,
} from '@p2p/shared';

/**
 * Regression: resolving an appeal on a Pay-In that was already PAID must adjust balances
 * by (resolved − previously_settled), not re-book the full resolved amount.
 */
describe('Pay-in appeal settlement delta (balance v2)', () => {
  const rateTraderIn = 41.5;
  const merchantCommissionFraction = 0.03;

  it('books additional trader USDT debit and merchant credit for overpaid appeal resolution', () => {
    const previouslySettledLocal = 3000;
    const resolvedLocal = 60000;
    const deltaLocal = resolvedLocal - previouslySettledLocal;

    const priorTraderDebit = debitUsdtPayin(previouslySettledLocal, rateTraderIn);
    const fullTraderDebit = debitUsdtPayin(resolvedLocal, rateTraderIn);
    const deltaTraderDebit = debitUsdtPayin(deltaLocal, rateTraderIn);

    expect(deltaTraderDebit).toBeCloseTo(fullTraderDebit - priorTraderDebit, 6);

    const priorMerchantCredit = creditFiatMerchantPayin(
      previouslySettledLocal,
      merchantCommissionFraction,
    );
    const fullMerchantCredit = creditFiatMerchantPayin(
      resolvedLocal,
      merchantCommissionFraction,
    );
    const deltaMerchantCredit = creditFiatMerchantPayin(
      deltaLocal,
      merchantCommissionFraction,
    );

    expect(deltaMerchantCredit).toBeCloseTo(
      fullMerchantCredit - priorMerchantCredit,
      2,
    );
  });

  it('reduces balances when appeal resolves to a lower amount than prior settlement', () => {
    const previouslySettledLocal = 60000;
    const resolvedLocal = 3000;
    const deltaLocal = resolvedLocal - previouslySettledLocal;

    expect(deltaLocal).toBeLessThan(0);
    expect(debitUsdtPayin(deltaLocal, rateTraderIn)).toBeLessThan(0);
    expect(
      creditFiatMerchantPayin(deltaLocal, merchantCommissionFraction),
    ).toBeLessThan(0);
  });
});

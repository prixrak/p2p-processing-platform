import {
  averageParserRateFromOffers,
  creditFiatMerchantPayin,
  debitFiatMerchantPayout,
  debitUsdtPayin,
  creditUsdtPayout,
  payinTraderMarkupPercentPoints,
  percentToFraction,
  platformMarginLocal,
  platformMarginUsdtPayin,
  platformMarginUsdtPayout,
  rateAdminIn,
  rateAdminOut,
  rateTraderIn,
  rateTraderOut,
} from '../balance-v2';

describe('balance-v2 (spec Block 5)', () => {
  const P = 44.32;
  const traderPayin = 0.01;
  const traderPayout = 0.002;
  const merchPayin = 0.05;
  const merchPayout = 0.02;

  it('Pay-In example: trader debit & platform margin', () => {
    const rt = rateTraderIn(P, traderPayin);
    expect(payinTraderMarkupPercentPoints(P, rt)).toBeCloseTo(1, 5);
    expect(payinTraderMarkupPercentPoints(0, rt)).toBeNull();
    const ra = rateAdminIn(P, merchPayin);
    expect(rt).toBeCloseTo(44.7632, 4);
    const debit = debitUsdtPayin(10_000, rt);
    expect(debit).toBeCloseTo(223.4, 1);
    const margin = platformMarginUsdtPayin(10_000, rt, ra);
    expect(margin).toBeCloseTo(8.51, 2);
    expect(platformMarginLocal(margin, P)).toBeCloseTo(margin * P, 5);
  });

  it('Pay-Out example: trader credit & platform margin', () => {
    const rt = rateTraderOut(P, traderPayout);
    const ra = rateAdminOut(P, merchPayout);
    expect(rt).toBeCloseTo(44.2314, 4);
    expect(ra).toBeCloseTo(43.4336, 4);
    const credit = creditUsdtPayout(9_000, rt);
    expect(credit).toBeCloseTo(203.48, 2);
    const margin = platformMarginUsdtPayout(9_000, ra, rt);
    expect(margin).toBeCloseTo(3.74, 2);
    // Doc rounds intermediate USDT margin; local fiat leg is margin_usdt × P.
    expect(platformMarginLocal(margin, P)).toBeCloseTo(margin * P, 5);
  });

  it('merchant Pay-In credit uses fraction', () => {
    expect(creditFiatMerchantPayin(10_000, 0.05)).toBe(9_500);
  });

  it('merchant Pay-Out debit uses fraction', () => {
    expect(debitFiatMerchantPayout(9_000, 0.02)).toBeCloseTo(9_180, 6);
  });

  it('percentToFraction matches commission tiers stored as percent', () => {
    expect(percentToFraction(5)).toBe(0.05);
  });

  it('parser average skips top and takes 3rd–5th', () => {
    const offers = [
      { price: 43.9, nickName: 'promo', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.0, nickName: 'a', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.1, nickName: 'b', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.3, nickName: 'c', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.33, nickName: 'd', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.35, nickName: 'e', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
      { price: 44.5, nickName: 'f', minFiat: 0, maxFiat: 100_000, payTypeLabels: [] },
    ];
    const res = averageParserRateFromOffers(offers, 1);
    expect(res).not.toBeNull();
    expect(res!.picked.map((o) => o.nickName)).toEqual(['c', 'd', 'e']);
    expect(res!.rate).toBeCloseTo((44.3 + 44.33 + 44.35) / 3, 6);
  });
});

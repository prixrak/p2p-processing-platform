/**
 * Balance model v2 (Block 5): parser rate P (fiat per 1 USDT), trader rate adjustments,
 * merchant commission as fraction of amount, platform margin in USDT.
 * Percent inputs from DB (e.g. 5 meaning 5%) are converted via percentToFraction.
 */

export function percentToFraction(percent: number): number {
  return percent / 100;
}

export function rateTraderIn(parserRate: number, traderPayinRateFraction: number): number {
  return parserRate * (1 + traderPayinRateFraction);
}

/**
 * Inverse of {@link rateTraderIn}: markup over parser P as human percent points (1 => 1%).
 * Used for transparent Pay-In UI; returns null when inputs are unusable.
 */
export function payinTraderMarkupPercentPoints(
  parserRateFiatPerUsdt: number,
  rateTraderInVal: number,
): number | null {
  if (!(parserRateFiatPerUsdt > 0) || !Number.isFinite(rateTraderInVal)) return null;
  return (rateTraderInVal / parserRateFiatPerUsdt - 1) * 100;
}

export function rateTraderOut(parserRate: number, traderPayoutRateFraction: number): number {
  return parserRate * (1 - traderPayoutRateFraction);
}

/** Admin / platform reference rate for Pay-In margin (merchant commission increases divisor). */
export function rateAdminIn(parserRate: number, merchantPayinCommissionFraction: number): number {
  return parserRate * (1 + merchantPayinCommissionFraction);
}

/** Admin / platform reference rate for Pay-Out margin. */
export function rateAdminOut(parserRate: number, merchantPayoutCommissionFraction: number): number {
  return parserRate * (1 - merchantPayoutCommissionFraction);
}

export function debitUsdtPayin(amountFiat: number, rateTraderInVal: number): number {
  return amountFiat / rateTraderInVal;
}

export function creditUsdtPayout(amountFiat: number, rateTraderOutVal: number): number {
  return amountFiat / rateTraderOutVal;
}

export function creditFiatMerchantPayin(amountFiat: number, merchantCommissionFraction: number): number {
  return amountFiat * (1 - merchantCommissionFraction);
}

export function debitFiatMerchantPayout(amountFiat: number, merchantCommissionFraction: number): number {
  return amountFiat * (1 + merchantCommissionFraction);
}

export function platformMarginUsdtPayin(
  amountFiat: number,
  rateTraderInVal: number,
  rateAdminInVal: number,
): number {
  return amountFiat / rateTraderInVal - amountFiat / rateAdminInVal;
}

export function platformMarginUsdtPayout(
  amountFiat: number,
  rateAdminOutVal: number,
  rateTraderOutVal: number,
): number {
  return amountFiat / rateAdminOutVal - amountFiat / rateTraderOutVal;
}

/** Platform margin booked in order fiat (margin_usdt × parser_rate). */
export function platformMarginLocal(marginUsdt: number, parserRate: number): number {
  return marginUsdt * parserRate;
}

export type BinanceP2pOfferPick = {
  price: number;
  nickName: string;
  minFiat: number;
  maxFiat: number;
  payTypeLabels: string[];
};

/**
 * From filtered & sorted-by-price offers (ascending), skip promoted top rows, average prices at
 * 0-based indices (skipTop + 2), (skipTop + 3), (skipTop + 4) — i.e. 3rd–5th among non-skipped.
 */
export function averageParserRateFromOffers(
  sortedByPriceAsc: BinanceP2pOfferPick[],
  skipTop = 1,
): { rate: number; picked: BinanceP2pOfferPick[] } | null {
  if (sortedByPriceAsc.length < skipTop + 3) return null;
  const slice = sortedByPriceAsc.slice(skipTop);
  const picked = [slice[2], slice[3], slice[4]].filter(Boolean);
  if (picked.length !== 3) return null;
  const rate = (picked[0].price + picked[1].price + picked[2].price) / 3;
  return { rate, picked };
}

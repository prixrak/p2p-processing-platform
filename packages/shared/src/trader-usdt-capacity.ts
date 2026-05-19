/** Epsilon for USDT capacity comparisons (aligned with cascade money checks). */
export const USDT_CAPACITY_EPS = 1e-9;

export interface TraderUsdtCapacityInput {
  balanceUsdt: number;
  overdraftLimitUsdt: number;
  pendingPayinDebitUsdt?: number;
  lowCapacityThresholdUsdt?: number;
}

export interface TraderUsdtCapacitySnapshot {
  /** Balance + overdraft limit (gross, before pending Pay-In reservations). */
  grossAvailableUsdt: number;
  /** Headroom after reserved pending Pay-In USDT debits (cascade assignment gate). */
  effectiveAvailableUsdt: number;
  pendingPayinDebitUsdt: number;
  payinCapacityExhausted: boolean;
  lowPayinCapacityAlert: boolean;
}

export function computeTraderUsdtCapacity(
  input: TraderUsdtCapacityInput,
): TraderUsdtCapacitySnapshot {
  const balance = Number(input.balanceUsdt) || 0;
  const overdraft = Number(input.overdraftLimitUsdt) || 0;
  const pending = Number(input.pendingPayinDebitUsdt ?? 0) || 0;
  const threshold = Number(input.lowCapacityThresholdUsdt ?? 200);
  const gross = balance + overdraft;
  const effective = gross - pending;
  return {
    grossAvailableUsdt: gross,
    effectiveAvailableUsdt: effective,
    pendingPayinDebitUsdt: pending,
    payinCapacityExhausted: effective <= USDT_CAPACITY_EPS,
    lowPayinCapacityAlert: effective <= threshold + USDT_CAPACITY_EPS,
  };
}

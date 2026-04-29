/**
 * Pay-In cascade routing — pure helpers (Levels 2–3 per cascade routing spec).
 * Tier-1 trader deficit ordering lives in the API service (DB aggregates).
 */

export type TraderCascadeMethod = 'CARD' | 'FORK';

export interface ForkAutolimitInputs {
  traderMethod: TraderCascadeMethod;
  limitTotalAmount: number;
  usedAmount: number;
  limitTotalOps: number;
  usedOps: number;
  manualMin: number;
  manualMax: number;
  autolimitEnabledGlobal: boolean;
  /** Fraction (e.g. 0.2): activate when empty remainder / limitTotalAmount <= threshold */
  autolimitThreshold: number;
}

/** Whether Fork autolimits apply and the threshold for activation is reached. */
export function isForkAutolimitActive(inp: ForkAutolimitInputs): boolean {
  if (inp.traderMethod !== 'FORK' || !inp.autolimitEnabledGlobal) {
    return false;
  }
  const lim = inp.limitTotalAmount;
  if (lim <= 0) return false;
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const fracRemaining = remainingAmt / lim;
  return fracRemaining <= inp.autolimitThreshold && fracRemaining >= 0;
}

export interface EffectiveAmountBounds {
  effMin: number;
  effMax: number;
}

/**
 * Nominals sorted ascending (e.g. DB coverage settings).
 * coverageExcludeSelf(N) = count of *other* requisites that accept nominal N (integer comparison).
 */
export function computeForkAssignBounds(
  inp: ForkAutolimitInputs,
  nominalAmountsAsc: number[],
  coverageExcludeSelf: (nominal: number) => number,
): EffectiveAmountBounds | null {
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const remainingTx = inp.limitTotalOps - inp.usedOps;
  if (remainingAmt <= 0 || remainingTx <= 0) {
    return null;
  }

  let effMin = inp.manualMin;
  let effMax = Math.min(inp.manualMax, remainingAmt);

  if (!isForkAutolimitActive(inp)) {
    if (effMin > effMax) return null;
    return { effMin, effMax };
  }

  const autoMinRaw = remainingAmt / remainingTx;
  const autoMin = Math.max(inp.manualMin, autoMinRaw);

  const sorted = [...nominalAmountsAsc].sort((a, b) => a - b);
  const aboveAutoMin = sorted.filter((n) => n >= autoMin - 1e-9);
  if (aboveAutoMin.length === 0) {
    effMin = Math.max(effMin, autoMin);
    effMax = Math.min(effMax, remainingAmt);
    if (effMin > effMax) return null;
    return { effMin, effMax };
  }

  let autoMaxCandidate = aboveAutoMin[0]!;
  const hole = sorted.find((n) => n >= autoMin - 1e-9 && coverageExcludeSelf(n) === 0);
  if (hole !== undefined) {
    autoMaxCandidate = hole;
  } else {
    const strictlyAbove = sorted.filter((n) => n > autoMin + 1e-9);
    autoMaxCandidate =
      strictlyAbove.length > 0 ? strictlyAbove[0]! : aboveAutoMin[aboveAutoMin.length - 1]!;
  }

  effMin = Math.max(effMin, autoMin);
  effMax = Math.min(effMax, autoMaxCandidate);
  effMax = Math.min(effMax, remainingAmt);

  if (effMin > effMax) return null;
  return { effMin, effMax };
}

/** fill_ratio × weight — higher receives next assignment on Level 2 */
export function requisiteRating(
  usedAmount: number,
  limitTotalAmount: number,
  methodWeight: number,
): number {
  if (limitTotalAmount <= 0) return 0;
  const fillRatio = usedAmount / limitTotalAmount;
  return fillRatio * methodWeight;
}

/**
 * "Soft" bounds for *other* requisites when estimating platform coverage (Fork uses auto_min when active).
 */
export function approximateOthersEffectiveRange(inp: {
  traderMethod: TraderCascadeMethod;
  limitTotalAmount: number;
  usedAmount: number;
  limitTotalOps: number;
  usedOps: number;
  manualMin: number;
  manualMax: number;
  autolimitEnabledGlobal: boolean;
  autolimitThreshold: number;
}): { min: number; max: number } | null {
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const remainingTx = inp.limitTotalOps - inp.usedOps;
  if (remainingAmt <= 0 || remainingTx <= 0) return null;

  let lo = inp.manualMin;
  let hi = Math.min(inp.manualMax, remainingAmt);

  if (
    inp.traderMethod === 'FORK' &&
    inp.autolimitEnabledGlobal &&
    inp.limitTotalAmount > 0 &&
    remainingAmt / inp.limitTotalAmount <= inp.autolimitThreshold
  ) {
    const autoMin = Math.max(inp.manualMin, remainingAmt / remainingTx);
    lo = Math.max(lo, autoMin);
    hi = Math.min(hi, remainingAmt);
  }

  if (lo > hi) return null;
  return { min: lo, max: hi };
}

/** Whether `amount` falls within [min,max] inclusive for assignment checks */
export function nominalCoveredByRange(amount: number, min: number, max: number): boolean {
  return amount >= min - 1e-9 && amount <= max + 1e-9;
}

/**
 * Pay-In cascade routing — pure helpers (Fork autolimits, coverage, TZ v3.1 idle race).
 * Tier-1 method-level ordering and DB-backed credits live in the API service.
 */

import { sha256HexUtf8 } from './sha256-hex';

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

/** Half-cent tolerance for fiat (2 dp) comparisons after rounding. */
export const MONEY_COMPARE_EPS = 0.005;

export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

/** Fill ratio by amount (0–1). */
export function fillRatioAmount(usedAmount: number, limitTotalAmount: number): number {
  if (limitTotalAmount <= 0) return 0;
  return Math.min(1, Math.max(0, usedAmount / limitTotalAmount));
}

/** Fill ratio by transaction count (0–1). */
export function fillRatioTx(usedOps: number, limitTotalOps: number): number {
  if (limitTotalOps <= 0) return 0;
  return Math.min(1, Math.max(0, usedOps / limitTotalOps));
}

/**
 * TZ display rating: int 0–100 from amount fill ratio.
 */
export function tzRequisiteRatingPercent(fillRatioAmount: number): number {
  return Math.round(Math.min(1, Math.max(0, fillRatioAmount)) * 100);
}

/**
 * Fork autolimit auto-min = remaining_amount / remaining_tx (when autolimit active).
 */
export function forkAutolimitAutoMinPerTx(inp: ForkAutolimitInputs): number | undefined {
  if (!isForkAutolimitActive(inp)) return undefined;
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const remainingTx = inp.limitTotalOps - inp.usedOps;
  if (remainingTx <= 0) return undefined;
  return remainingAmt / remainingTx;
}

/**
 * Coverage-gap auto max nominal for Fork autolimit (same algorithm as assign bounds).
 * Undefined when autolimit inactive or no valid band.
 */
export function computeForkAutolimitAutoMaxAmount(
  inp: ForkAutolimitInputs,
  nominalAmountsAsc: number[],
  coverageExcludeSelf: (nominal: number) => number,
): number | undefined {
  if (!isForkAutolimitActive(inp)) return undefined;
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const remainingTx = inp.limitTotalOps - inp.usedOps;
  if (remainingAmt <= 0 || remainingTx <= 0) {
    return undefined;
  }

  const autoMinRaw = remainingAmt / remainingTx;
  const autoMin = Math.max(inp.manualMin, autoMinRaw);

  const sorted = [...nominalAmountsAsc].sort((a, b) => a - b);
  const aboveAutoMin = sorted.filter((n) => n >= autoMin - 1e-9);
  if (aboveAutoMin.length === 0) {
    return undefined;
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
  return autoMaxCandidate;
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

  const autoMaxNominal = computeForkAutolimitAutoMaxAmount(inp, nominalAmountsAsc, coverageExcludeSelf);
  if (autoMaxNominal === undefined) {
    effMin = Math.max(effMin, autoMin);
    effMax = Math.min(effMax, remainingAmt);
    if (effMin > effMax) return null;
    return { effMin, effMax };
  }

  effMin = Math.max(effMin, autoMin);
  effMax = Math.min(effMax, autoMaxNominal);
  effMax = Math.min(effMax, remainingAmt);

  if (effMin > effMax) return null;
  return { effMin, effMax };
}

/**
 * Maximum Pay-In amount this requisite may accept: manual cap and remaining amount headroom.
 * Fork autolimit nominal slicing does not lower this cap (see `computeForkAssignBounds` effMax).
 */
export function payInAssignMax(inp: ForkAutolimitInputs): number | null {
  const remainingAmt = inp.limitTotalAmount - inp.usedAmount;
  const remainingTx = inp.limitTotalOps - inp.usedOps;
  if (remainingAmt <= 0 || remainingTx <= 0) return null;
  return roundMoney2(Math.min(inp.manualMax, remainingAmt));
}

/**
 * Validates Pay-In amount against trader manual limits and remaining requisite headroom.
 * Uses `computeForkAssignBounds` for the **minimum** (Fork autolimit floor). The **maximum** is
 * always `payInAssignMax` so Fork autolimit nominal slicing cannot block a single order that fits
 * remaining headroom and manual max (e.g. one 20k order when 20k remains).
 */
export function payInAmountWithinAssignRange(
  inp: ForkAutolimitInputs,
  nominalAmountsAsc: number[],
  coverageExcludeSelf: (nominal: number) => number,
  amount: number,
): { ok: true } | { ok: false; code: string; detail: string } {
  const bounds = computeForkAssignBounds(inp, nominalAmountsAsc, coverageExcludeSelf);
  if (!bounds) {
    return {
      ok: false,
      code: 'EFFECTIVE_BOUNDS_UNAVAILABLE',
      detail:
        'Fork/card bounds could not be derived (limits exhausted or incompatible with coverage grid).',
    };
  }
  const assignMax = payInAssignMax(inp);
  if (assignMax === null) {
    return {
      ok: false,
      code: 'EFFECTIVE_BOUNDS_UNAVAILABLE',
      detail:
        'Fork/card bounds could not be derived (limits exhausted or incompatible with coverage grid).',
    };
  }
  const assignMin = roundMoney2(bounds.effMin);
  const a = roundMoney2(amount);
  if (a < assignMin - MONEY_COMPARE_EPS || a > assignMax + MONEY_COMPARE_EPS) {
    return {
      ok: false,
      code: 'AMOUNT_OUTSIDE_EFFECTIVE_RANGE',
      detail: `Amount ${amount} not in [${assignMin.toFixed(2)}, ${assignMax.toFixed(2)}].`,
    };
  }
  return { ok: true };
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

/** True when `amount` matches an in-flight Pay-In already reserved on this requisite. */
export function payInAmountBlockedOnRequisite(
  occupiedAmounts: readonly number[],
  amount: number,
): boolean {
  const target = roundMoney2(amount);
  return occupiedAmounts.some(
    (a) => Math.abs(roundMoney2(a) - target) <= MONEY_COMPARE_EPS,
  );
}

// ─── TZ v3.1 — idle-time race & method-level primary selection ───

export type CascadeAssignmentLevel = 'FORK' | 'CARD' | 'PROVIDER';

export type CascadeLevelPickMode = 'DEBT' | 'STOCHASTIC';

/** Multiplier applied while a requisite has never received a Pay-In assignment (TZ newcomer boost). */
export const NEWCOMER_RATING_BOOST = 2;

export function effectiveIdleMs(nowMs: number, idleAnchorMs: number): number {
  return Math.max(0, nowMs - idleAnchorMs);
}

export function newcomerRatingBoostMultiplier(assignmentsCount: number): number {
  return assignmentsCount === 0 ? NEWCOMER_RATING_BOOST : 1;
}

/** Confirmed Pay-In fill ratio in [0, 1] vs total requisite limit (TZ fork fill multiplier). */
export function confirmedPayinFillRatio(confirmedAmount: number, limitTotalAmount: number): number {
  if (!(limitTotalAmount > 0)) return 0;
  return Math.min(1, Math.max(0, confirmedAmount / limitTotalAmount));
}

/** One step in the Fork fill_multiplier ladder (TZ §7.3 `multipliers_config`). */
export type FillMultiplierTier = { from: number; to: number; multiplier: number };

/** Default TZ v3.1 ladder when DB `fill_multipliers_config` is unset. */
export const DEFAULT_FILL_MULTIPLIER_TIERS: readonly FillMultiplierTier[] = [
  { from: 0, to: 0.6, multiplier: 1 },
  { from: 0.6, to: 0.7, multiplier: 1.5 },
  { from: 0.7, to: 0.8, multiplier: 2 },
  { from: 0.8, to: 0.9, multiplier: 3 },
  { from: 0.9, to: 1, multiplier: 5 },
];

/**
 * Parse optional `cascade_settings.fill_multipliers_config` JSON into validated tiers.
 * Expects `[{ "from": 0, "to": 0.6, "multiplier": 1 }, ...]` covering [0,1] without gaps (best-effort).
 */
export function parseFillMultiplierTiersJson(raw: unknown): FillMultiplierTier[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: FillMultiplierTier[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const o = row as Record<string, unknown>;
    const from = Number(o.from);
    const to = Number(o.to);
    const multiplier = Number(o.multiplier);
    if (![from, to, multiplier].every((n) => Number.isFinite(n))) return null;
    if (from < 0 || to > 1 + 1e-9 || from >= to - 1e-12) return null;
    if (multiplier <= 0) return null;
    out.push({ from, to, multiplier });
  }
  if (out.length === 0) return null;
  out.sort((a, b) => a.from - b.from);
  return out;
}

/** Fingerprint for Redis/cache invalidation when fill ladder JSON changes. */
export function fillMultiplierConfigFingerprint(raw: unknown): string {
  const s = JSON.stringify(raw ?? null);
  return sha256HexUtf8(s).slice(0, 32);
}

/** Multiplier from confirmed fill ratio steps (TZ fork tier); optional DB-driven ladder. */
export function fillMultiplierFromConfirmedFill(
  confirmedFill01: number,
  tiers?: readonly FillMultiplierTier[] | null,
): number {
  const x = Math.min(1, Math.max(0, confirmedFill01));
  const steps = tiers && tiers.length > 0 ? tiers : DEFAULT_FILL_MULTIPLIER_TIERS;
  for (const s of steps) {
    if (x >= s.from - 1e-12 && x < s.to - 1e-12) {
      return s.multiplier;
    }
  }
  const last = steps[steps.length - 1]!;
  if (x >= last.from - 1e-12 && x <= 1 + 1e-12) return last.multiplier;
  return 1;
}

/** Fork tier idle race: idle × max(fill_mult, trader_mult); newcomer requisites bump fill_mult to at least NEWCOMER_RATING_BOOST. */
export function forkCascadeRaceScore(input: {
  idleMs: number;
  confirmedFill01: number;
  traderMultiplier: number;
  payinAssignmentsCount: number;
  fillTiers?: readonly FillMultiplierTier[] | null;
}): number {
  let fm = fillMultiplierFromConfirmedFill(input.confirmedFill01, input.fillTiers);
  if (input.payinAssignmentsCount === 0) {
    fm = Math.max(fm, NEWCOMER_RATING_BOOST);
  }
  const eff = Math.max(fm, Math.max(1e-9, input.traderMultiplier));
  return input.idleMs * eff;
}

/** Card tier (TZ): idle × trader_mult only — no confirmed-fill ladder and no newcomer fill boost. */
export function cardCascadeRaceScore(input: { idleMs: number; traderMultiplier: number }): number {
  return input.idleMs * Math.max(1e-9, input.traderMultiplier);
}

export type CascadePrimaryAssignmentLevel = 'FORK' | 'CARD';

/**
 * Fork vs Card split for tier-1 routing (percentages sum to ~100%). Provider traffic is irrelevant here.
 */
export function normalizeCascadeForkCardSplitPercent(fork: number, card: number): {
  fork: number;
  card: number;
} {
  const f = Math.max(0, fork);
  const c = Math.max(0, card);
  const sum = f + c;
  if (sum <= 1e-15) {
    return { fork: 50, card: 50 };
  }
  return { fork: (f / sum) * 100, card: (c / sum) * 100 };
}

/** Normalize non-negative Fork / Card / Provider shares to sum 100. If all zero, equal thirds. */
export function normalizeCascadeMethodPercents(input: {
  fork: number;
  card: number;
  provider: number;
}): { fork: number; card: number; provider: number } {
  const f = Math.max(0, input.fork);
  const c = Math.max(0, input.card);
  const p = Math.max(0, input.provider);
  const sum = f + c + p;
  if (sum <= 0) {
    const third = 100 / 3;
    return { fork: third, card: third, provider: third };
  }
  return {
    fork: (f / sum) * 100,
    card: (c / sum) * 100,
    provider: (p / sum) * 100,
  };
}

/**
 * Tier-1 primary level (Fork vs Card only). Provider is tried only later as a fallback; it is never
 * chosen directly as primary (TZ cascade concept).
 */
export function pickPrimaryCascadeLevelDebt(
  credits: { fork: number; card: number; provider: number },
  targetsPct: { fork: number; card: number; provider: number },
): CascadePrimaryAssignmentLevel {
  const fc = normalizeCascadeForkCardSplitPercent(targetsPct.fork, targetsPct.card);
  const eff: Array<{ level: CascadePrimaryAssignmentLevel; v: number }> = [
    { level: 'FORK', v: credits.fork + fc.fork / 100 },
    { level: 'CARD', v: credits.card + fc.card / 100 },
  ];
  const maxV = Math.max(eff[0]!.v, eff[1]!.v);
  const tops = eff.filter((e) => Math.abs(e.v - maxV) < 1e-12);
  tops.sort((a, b) => (a.level === 'FORK' ? 0 : 1) - (b.level === 'FORK' ? 0 : 1));
  return tops[0]!.level;
}

/** Stochastic primary level (Fork vs Card only); `random01` in [0, 1). Provider share is ignored. */
export function pickPrimaryCascadeLevelStochastic(
  targetsPct: { fork: number; card: number; provider: number },
  random01: () => number,
): CascadePrimaryAssignmentLevel {
  const fc = normalizeCascadeForkCardSplitPercent(targetsPct.fork, targetsPct.card);
  const tf = fc.fork / 100;
  const r = random01();
  return r < tf ? 'FORK' : 'CARD';
}

/** Full fallback chain starting with the chosen primary level. */
export function cascadeLevelAttemptOrder(primary: CascadeAssignmentLevel): CascadeAssignmentLevel[] {
  const all: CascadeAssignmentLevel[] = ['FORK', 'CARD', 'PROVIDER'];
  return [primary, ...all.filter((l) => l !== primary)];
}

/**
 * Advance level credits after a successful assignment. Debit is applied to the **Fork/Card primary**
 * picked for this Pay-In (not the landed fallback tier). Fork/Card accumulator steps use Fork+Card
 * normalized percentages; provider credit receives `targetsPct.provider / 100` per assignment step.
 */
export function applyCascadeCreditsAfterAssignment(
  credits: { fork: number; card: number; provider: number },
  targetsPct: { fork: number; card: number; provider: number },
  primaryLevel: CascadePrimaryAssignmentLevel,
): { fork: number; card: number; provider: number } {
  const fc = normalizeCascadeForkCardSplitPercent(targetsPct.fork, targetsPct.card);
  let fork = credits.fork + fc.fork / 100;
  let card = credits.card + fc.card / 100;
  let provider = credits.provider + targetsPct.provider / 100;
  if (primaryLevel === 'FORK') fork -= 1;
  else card -= 1;
  return { fork, card, provider };
}

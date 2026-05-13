import {
  DEFAULT_FILL_MULTIPLIER_TIERS,
  type FillMultiplierTier,
  parseFillMultiplierTiersJson,
} from '@p2p/shared';

/** Canonical 5-step ladder: [0,b), fixed 10% slices, ending at 1. Mirrors default TZ shape. */
const EPS = 1e-4;
const CANONICAL_BAND = 0.1;

/** Min/max first-band end (% confirmed fill), keeps later bands inside (0,1]. */
export const FILL_LADDER_THRESHOLD_PCT_MIN = 45;
export const FILL_LADDER_THRESHOLD_PCT_MAX = 69;

export function buildCanonicalFillLadderJson(
  thresholdPct: number,
  multipliers: readonly [number, number, number, number],
): string {
  let b =
    Math.min(FILL_LADDER_THRESHOLD_PCT_MAX, Math.max(FILL_LADDER_THRESHOLD_PCT_MIN, thresholdPct)) /
    100;
  if (b + 3 * CANONICAL_BAND > 1 - EPS) {
    b = 1 - 3 * CANONICAL_BAND - EPS;
  }
  const rows: FillMultiplierTier[] = [
    { from: 0, to: b, multiplier: 1 },
    {
      from: b,
      to: b + CANONICAL_BAND,
      multiplier: Math.max(1e-9, multipliers[0] ?? 1),
    },
    {
      from: b + CANONICAL_BAND,
      to: b + 2 * CANONICAL_BAND,
      multiplier: Math.max(1e-9, multipliers[1] ?? 1),
    },
    {
      from: b + 2 * CANONICAL_BAND,
      to: b + 3 * CANONICAL_BAND,
      multiplier: Math.max(1e-9, multipliers[2] ?? 1),
    },
    {
      from: b + 3 * CANONICAL_BAND,
      to: 1,
      multiplier: Math.max(1e-9, multipliers[3] ?? 1),
    },
  ];
  return JSON.stringify(rows, null, 2);
}

export type CanonicalFillLadderUi = {
  thresholdPct: number;
  multipliers: [number, number, number, number];
};

export function ladderFromDefaults(): CanonicalFillLadderUi {
  const t = [...DEFAULT_FILL_MULTIPLIER_TIERS];
  return {
    thresholdPct: Math.round(t[0]!.to * 1000) / 10,
    multipliers: [t[1]!.multiplier, t[2]!.multiplier, t[3]!.multiplier, t[4]!.multiplier],
  };
}

/** Returns null when tiers are valid JSON but do not match the canonical 10% stripe shape. */
export function tryParseCanonicalFillLadder(raw: unknown): CanonicalFillLadderUi | null {
  const tiers = parseFillMultiplierTiersJson(raw);
  if (!tiers || tiers.length !== 5) return null;
  const t = [...tiers].sort((a, x) => a.from - x.from);
  if (Math.abs(t[0]!.from) > EPS) return null;
  if (Math.abs(t[4]!.to - 1) > EPS) return null;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(t[i]!.to - t[i + 1]!.from) > 0.02) return null;
  }
  for (let i = 1; i <= 3; i++) {
    const w = t[i]!.to - t[i]!.from;
    if (Math.abs(w - CANONICAL_BAND) > 0.02) return null;
  }
  return {
    thresholdPct: Math.round(t[0]!.to * 1000) / 10,
    multipliers: [t[1]!.multiplier, t[2]!.multiplier, t[3]!.multiplier, t[4]!.multiplier],
  };
}

export function interpretFillLaddersConfig(raw: unknown): {
  canonical: CanonicalFillLadderUi | null;
} {
  if (raw == null) {
    return { canonical: ladderFromDefaults() };
  }
  return { canonical: tryParseCanonicalFillLadder(raw) };
}

export type FillLadderDraftMode = 'canonical' | 'custom_tiers' | 'invalid_json';

export type FillLadderInterpretation =
  | { mode: 'empty'; canonical: CanonicalFillLadderUi }
  | { mode: 'canonical'; canonical: CanonicalFillLadderUi }
  | { mode: 'custom_tiers' }
  | { mode: 'invalid_json' };

export function interpretFillMultipliersDraftString(trimmed: string): FillLadderInterpretation {
  if (trimmed === '') {
    return { mode: 'empty', canonical: ladderFromDefaults() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { mode: 'invalid_json' };
  }
  const canonical = tryParseCanonicalFillLadder(parsed);
  if (canonical) {
    return { mode: 'canonical', canonical };
  }
  const tiers = parseFillMultiplierTiersJson(parsed);
  if (tiers) {
    return { mode: 'custom_tiers' };
  }
  return { mode: 'invalid_json' };
}

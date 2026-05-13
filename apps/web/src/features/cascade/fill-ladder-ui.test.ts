import { describe, expect, it } from 'vitest';
import { DEFAULT_FILL_MULTIPLIER_TIERS } from '@p2p/shared';
import {
  buildCanonicalFillLadderJson,
  interpretFillLaddersConfig,
  ladderFromDefaults,
  tryParseCanonicalFillLadder,
} from './fill-ladder-ui';

describe('fill-ladder-ui', () => {
  it('round-trips defaults', () => {
    const d = ladderFromDefaults();
    const json = buildCanonicalFillLadderJson(d.thresholdPct, d.multipliers);
    const parsed = tryParseCanonicalFillLadder(JSON.parse(json) as unknown);
    expect(parsed).not.toBeNull();
    expect(parsed!.multipliers).toEqual(d.multipliers);
    expect(Math.abs(parsed!.thresholdPct - d.thresholdPct)).toBeLessThan(0.05);
  });

  it('parseFillLaddersConfig null yields defaults aligned with shared package', () => {
    const { canonical } = interpretFillLaddersConfig(null);
    expect(canonical).not.toBeNull();
    const t = [...DEFAULT_FILL_MULTIPLIER_TIERS];
    expect(canonical!.multipliers).toEqual([
      t[1]!.multiplier,
      t[2]!.multiplier,
      t[3]!.multiplier,
      t[4]!.multiplier,
    ]);
  });
});

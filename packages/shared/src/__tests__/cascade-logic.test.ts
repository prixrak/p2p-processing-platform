import {
  computeForkAssignBounds,
  computeForkAutolimitAutoMaxAmount,
  fillRatioAmount,
  fillRatioTx,
  tzRequisiteRatingPercent,
  isForkAutolimitActive,
  nominalCoveredByRange,
  payInAmountBlockedOnRequisite,
  approximateOthersEffectiveRange,
  payInAmountWithinAssignRange,
  payInAssignMax,
  effectiveIdleMs,
  newcomerRatingBoostMultiplier,
  fillMultiplierFromConfirmedFill,
  forkCascadeRaceScore,
  cardCascadeRaceScore,
  confirmedPayinFillRatio,
  normalizeCascadeMethodPercents,
  pickPrimaryCascadeLevelDebt,
  pickPrimaryCascadeLevelStochastic,
  normalizeCascadeForkCardSplitPercent,
  cascadeLevelAttemptOrder,
  applyCascadeCreditsAfterAssignment,
  NEWCOMER_RATING_BOOST,
  type ForkAutolimitInputs,
} from '../cascade-logic';

describe('payInAmountBlockedOnRequisite', () => {
  it('detects same fiat amount within half-cent tolerance', () => {
    expect(payInAmountBlockedOnRequisite([1000, 2000], 1000)).toBe(true);
    expect(payInAmountBlockedOnRequisite([1000.004], 1000)).toBe(true);
    expect(payInAmountBlockedOnRequisite([1000], 2000)).toBe(false);
    expect(payInAmountBlockedOnRequisite([], 500)).toBe(false);
  });
});

describe('isForkAutolimitActive', () => {
  const base: ForkAutolimitInputs = {
    traderMethod: 'FORK',
    limitTotalAmount: 15000,
    usedAmount: 12000,
    usedOps: 6,
    limitTotalOps: 10,
    manualMin: 300,
    manualMax: 5000,
    autolimitEnabledGlobal: true,
    autolimitThreshold: 0.2,
  };

    it('activates when remaining fraction of limit is at threshold (doc 4.2)', () => {
    expect(isForkAutolimitActive(base)).toBe(true);
  });

  it('does not activate for CARD trader', () => {
    expect(isForkAutolimitActive({ ...base, traderMethod: 'CARD' })).toBe(false);
  });

  it('does not activate when global autolimits disabled', () => {
    expect(isForkAutolimitActive({ ...base, autolimitEnabledGlobal: false })).toBe(false);
  });
});

describe('computeForkAssignBounds', () => {
  const nominals = [300, 400, 500, 700, 800, 1000];

  it('computes doc 4.3 auto_min = remaining_amount / remaining_transactions', () => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'FORK',
      limitTotalAmount: 15000,
      usedAmount: 12000,
      usedOps: 6,
      limitTotalOps: 10,
      manualMin: 300,
      manualMax: 5000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.25,
    };
    const bounds = computeForkAssignBounds(inp, nominals, () => 5);
    expect(bounds).not.toBeNull();
    expect(bounds!.effMin).toBeCloseTo(750, 5);
  });

  it('sets auto_max to hole nominal when coverage is zero (doc 4.6 example)', () => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'FORK',
      limitTotalAmount: 15000,
      usedAmount: 12000,
      usedOps: 6,
      limitTotalOps: 10,
      manualMin: 300,
      manualMax: 5000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.25,
    };
    const coverage = (n: number) => (n === 800 ? 0 : 3);
    const bounds = computeForkAssignBounds(inp, nominals, coverage);
    expect(bounds).not.toBeNull();
    expect(bounds!.effMax).toBe(800);
  });

  it('uses manual limits for CARD trader (no Fork autolimits)', () => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'CARD',
      limitTotalAmount: 10000,
      usedAmount: 9000,
      usedOps: 9,
      limitTotalOps: 10,
      manualMin: 100,
      manualMax: 2000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.2,
    };
    const bounds = computeForkAssignBounds(inp, nominals, () => 1);
    expect(bounds).not.toBeNull();
    expect(bounds!.effMin).toBe(100);
  });
});

describe('payInAssignMax', () => {
  it('returns min(manualMax, remaining) and ignores Fork nominal effMax cap', () => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'FORK',
      limitTotalAmount: 15000,
      usedAmount: 12000,
      usedOps: 6,
      limitTotalOps: 10,
      manualMin: 300,
      manualMax: 5000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.25,
    };
    const nominals = [300, 400, 500, 700, 800, 1000];
    const bounds = computeForkAssignBounds(inp, nominals, () => 5);
    expect(bounds).not.toBeNull();
    expect(bounds!.effMax).toBeLessThan(3000 - 1e-6);
    expect(payInAssignMax(inp)).toBe(3000);
  });
});

describe('payInAmountWithinAssignRange', () => {
  const nominals = [300, 400, 500, 700, 800, 1000];

  it('allows one order up to remaining headroom even when Fork autolimit effMax was capped by nominals',
() => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'FORK',
      limitTotalAmount: 15000,
      usedAmount: 12000,
      usedOps: 6,
      limitTotalOps: 10,
      manualMin: 300,
      manualMax: 5000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.25,
    };
    const sliceBounds = computeForkAssignBounds(inp, nominals, () => 5);
    expect(sliceBounds).not.toBeNull();
    expect(sliceBounds!.effMax).toBeLessThan(3000 - 1e-6);

    const fullRemainder = 3000;
    const okFull = payInAmountWithinAssignRange(inp, nominals, () => 5, fullRemainder);
    expect(okFull.ok).toBe(true);

    const aboveManual = payInAmountWithinAssignRange(inp, nominals, () => 5, 6000);
    expect(aboveManual.ok).toBe(false);

    const cardInp: ForkAutolimitInputs = { ...inp, traderMethod: 'CARD' };
    const card = payInAmountWithinAssignRange(cardInp, nominals, () => 5, fullRemainder);
    expect(card.ok).toBe(true);
  });
});

describe('approximateOthersEffectiveRange', () => {
  it('returns null when capacity exhausted', () => {
    expect(
      approximateOthersEffectiveRange({
        traderMethod: 'FORK',
        limitTotalAmount: 100,
        usedAmount: 100,
        limitTotalOps: 5,
        usedOps: 0,
        manualMin: 1,
        manualMax: 90,
        autolimitEnabledGlobal: true,
        autolimitThreshold: 0.5,
      }),
    ).toBeNull();
  });
});

describe('nominalCoveredByRange', () => {
  it('includes boundaries', () => {
    expect(nominalCoveredByRange(500, 400, 600)).toBe(true);
    expect(nominalCoveredByRange(399, 400, 600)).toBe(false);
  });
});

describe('observability metrics', () => {
  it('fillRatioAmount clamps to 0–1', () => {
    expect(fillRatioAmount(0, 100)).toBe(0);
    expect(fillRatioAmount(50, 100)).toBe(0.5);
    expect(fillRatioAmount(200, 100)).toBe(1);
  });

  it('fillRatioTx', () => {
    expect(fillRatioTx(3, 10)).toBeCloseTo(0.3);
  });

  it('tzRequisiteRatingPercent', () => {
    expect(tzRequisiteRatingPercent(0.805)).toBe(81);
  });

  it('computeForkAutolimitAutoMaxAmount stays consistent with bounds', () => {
    const inp: ForkAutolimitInputs = {
      traderMethod: 'FORK',
      limitTotalAmount: 1000,
      usedAmount: 850,
      limitTotalOps: 100,
      usedOps: 60,
      manualMin: 50,
      manualMax: 5000,
      autolimitEnabledGlobal: true,
      autolimitThreshold: 0.2,
    };
    expect(isForkAutolimitActive(inp)).toBe(true);
    const nominals = [100, 200, 300, 400, 500];
    const maxN = computeForkAutolimitAutoMaxAmount(inp, nominals, () => 2);
    expect(maxN).toBeDefined();
    const bounds = computeForkAssignBounds(inp, nominals, () => 2);
    expect(bounds).not.toBeNull();
    if (bounds && maxN !== undefined) {
      expect(bounds.effMax).toBeLessThanOrEqual(maxN + 1e-6);
    }
  });
});

describe('TZ v3.1 cascade idle race & level picking', () => {
  it('effectiveIdleMs is non-negative', () => {
    expect(effectiveIdleMs(1000, 500)).toBe(500);
    expect(effectiveIdleMs(100, 200)).toBe(0);
  });

  it('newcomer boost applies only before first assignment', () => {
    expect(newcomerRatingBoostMultiplier(0)).toBe(NEWCOMER_RATING_BOOST);
    expect(newcomerRatingBoostMultiplier(1)).toBe(1);
  });

  it('normalizeCascadeMethodPercents sums to ~100', () => {
    const n = normalizeCascadeMethodPercents({ fork: 70, card: 30, provider: 0 });
    expect(n.fork + n.card + n.provider).toBeCloseTo(100, 5);
  });

  it('normalizeCascadeForkCardSplitPercent ignores denominator other than Fork+Card', () => {
    expect(normalizeCascadeForkCardSplitPercent(80, 20)).toEqual({ fork: 80, card: 20 });
    const m = normalizeCascadeForkCardSplitPercent(40, 40);
    expect(m.fork).toBeCloseTo(50, 5);
    expect(m.card).toBeCloseTo(50, 5);
    const z = normalizeCascadeForkCardSplitPercent(0, 0);
    expect(z).toEqual({ fork: 50, card: 50 });
  });

  it('pickPrimaryCascadeLevelDebt tie-break prefers FORK', () => {
    expect(
      pickPrimaryCascadeLevelDebt(
        { fork: 0, card: 0, provider: 0 },
        { fork: 50, card: 50, provider: 0 },
      ),
    ).toBe('FORK');
  });

  it('pickPrimaryCascadeLevelStochastic is deterministic with fixed RNG', () => {
    expect(
      pickPrimaryCascadeLevelStochastic({ fork: 50, card: 50, provider: 0 }, () => 0.2),
    ).toBe('FORK');
    expect(
      pickPrimaryCascadeLevelStochastic({ fork: 50, card: 50, provider: 0 }, () => 0.7),
    ).toBe('CARD');
  });

  it('pickPrimaryCascadeLevel never chooses PROVIDER (provider share ignored for primary tier)', () => {
    expect(
      pickPrimaryCascadeLevelDebt({ fork: 0, card: 0, provider: 1_000 }, { fork: 0, card: 0, provider: 100 }),
    ).toBe('FORK');
    expect(pickPrimaryCascadeLevelStochastic({ fork: 0, card: 0, provider: 100 }, () => 0.999)).toBe(
      'CARD',
    );
    expect(pickPrimaryCascadeLevelStochastic({ fork: 10, card: 10, provider: 100 }, () => 0)).toBe('FORK');
  });

  it('cascadeLevelAttemptOrder rotates primary', () => {
    expect(cascadeLevelAttemptOrder('CARD')).toEqual(['CARD', 'FORK', 'PROVIDER']);
  });

  it('cascadeLevelAttemptOrder lists primary then other tiers (TZ §5.3 fallback order)', () => {
    expect(cascadeLevelAttemptOrder('FORK')).toEqual(['FORK', 'CARD', 'PROVIDER']);
    expect(cascadeLevelAttemptOrder('PROVIDER')).toEqual(['PROVIDER', 'FORK', 'CARD']);
  });

  it('applyCascadeCreditsAfterAssignment debits the primary tier (not landed fallback tier)', () => {
    const targets = { fork: 70, card: 30, provider: 0 };
    const landedCard = applyCascadeCreditsAfterAssignment({ fork: 0, card: 0, provider: 0 }, targets, 'FORK');
    expect(landedCard.fork).toBeCloseTo(0.7 - 1, 10);
    expect(landedCard.card).toBeCloseTo(0.3, 10);

    const primaryCard = applyCascadeCreditsAfterAssignment({ fork: 0, card: 0, provider: 0 }, targets, 'CARD');
    expect(primaryCard.fork).toBeCloseTo(0.7, 10);
    expect(primaryCard.card).toBeCloseTo(0.3 - 1, 10);
  });

  it('applyCascadeCreditsAfterAssignment steps Fork+Card credits with Fork+Card normalization', () => {
    const targets = { fork: 40, card: 40, provider: 20 };
    const out = applyCascadeCreditsAfterAssignment({ fork: 0, card: 0, provider: 0 }, targets, 'FORK');
    expect(out.fork).toBeCloseTo(0.5 - 1, 10);
    expect(out.card).toBeCloseTo(0.5, 10);
    expect(out.provider).toBeCloseTo(0.2, 10);
  });

  it('fillMultiplierFromConfirmedFill steps at TZ thresholds', () => {
    expect(fillMultiplierFromConfirmedFill(0)).toBe(1);
    expect(fillMultiplierFromConfirmedFill(0.65)).toBe(1.5);
    expect(fillMultiplierFromConfirmedFill(0.95)).toBe(5);
  });

  it('confirmedPayinFillRatio clamps', () => {
    expect(confirmedPayinFillRatio(0, 100)).toBe(0);
    expect(confirmedPayinFillRatio(50, 100)).toBe(0.5);
    expect(confirmedPayinFillRatio(200, 100)).toBe(1);
  });

  it('forkCascadeRaceScore uses max of fill multiplier, newcomer floor, and trader mult', () => {
    const idle = 10;
    expect(
      forkCascadeRaceScore({
        idleMs: idle,
        confirmedFill01: 0,
        traderMultiplier: 3,
        payinAssignmentsCount: 1,
      }),
    ).toBeCloseTo(idle * 3, 10);
    expect(
      forkCascadeRaceScore({
        idleMs: idle,
        confirmedFill01: 0,
        traderMultiplier: 1,
        payinAssignmentsCount: 0,
      }),
    ).toBeCloseTo(idle * NEWCOMER_RATING_BOOST, 10);
  });

  it('cardCascadeRaceScore ignores newcomer and confirmed fill', () => {
    expect(
      cardCascadeRaceScore({
        idleMs: 100,
        traderMultiplier: 2,
      }),
    ).toBe(200);
  });
});

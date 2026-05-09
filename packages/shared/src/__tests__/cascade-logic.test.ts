import {
  computeForkAssignBounds,
  computeForkAutolimitAutoMaxAmount,
  fillRatioAmount,
  fillRatioTx,
  tzRequisiteRatingPercent,
  isForkAutolimitActive,
  nominalCoveredByRange,
  requisiteRating,
  approximateOthersEffectiveRange,
  type ForkAutolimitInputs,
} from '../cascade-logic';

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

describe('requisiteRating', () => {
  it('orders fuller requisites higher when weights equal', () => {
    const w = 100;
    expect(requisiteRating(8000, 10000, w)).toBeGreaterThan(requisiteRating(2000, 10000, w));
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

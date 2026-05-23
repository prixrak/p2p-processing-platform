import { describe, expect, it } from 'vitest';
import { computeDropdownBelowPosition } from './anchored-dropdown-position';

describe('computeDropdownBelowPosition', () => {
  it('opens below the trigger when there is enough space', () => {
    const trigger = { top: 100, bottom: 140, left: 200, right: 280, width: 80 };
    const pos = computeDropdownBelowPosition(trigger, 120, 180, 1200, 800);

    expect(pos).toEqual({ top: 144, left: 200 });
  });

  it('flips above the trigger when opening downward would overflow', () => {
    const trigger = { top: 720, bottom: 760, left: 200, right: 280, width: 80 };
    const menuHeight = 200;
    const pos = computeDropdownBelowPosition(trigger, 120, menuHeight, 1200, 800);

    expect(pos.top).toBe(516);
    expect(pos.left).toBe(200);
  });

  it('clamps horizontally when the panel would overflow the right edge', () => {
    const trigger = { top: 100, bottom: 140, left: 1150, right: 1190, width: 40 };
    const pos = computeDropdownBelowPosition(trigger, 120, 180, 1200, 800);

    expect(pos.left).toBe(1072);
  });
});

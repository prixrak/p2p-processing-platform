import { describe, expect, it } from 'vitest';
import {
  computeTraderPayinFinalizeMenuPosition,
  queryVisibleAnchorTrigger,
} from './order-finalize-dropdown-position';

describe('computeTraderPayinFinalizeMenuPosition', () => {
  it('places the menu below the trigger when there is room', () => {
    const trigger = { top: 100, bottom: 120, left: 400, right: 500 };
    const pos = computeTraderPayinFinalizeMenuPosition(trigger, 160, 90, 1200, 800);
    expect(pos).toEqual({ top: 124, left: 500 });
  });

  it('flips above the trigger when opening down would overflow the viewport', () => {
    const trigger = { top: 720, bottom: 740, left: 400, right: 500 };
    const menuH = 120;
    const pos = computeTraderPayinFinalizeMenuPosition(trigger, 160, menuH, 1200, 800);
    expect(pos.top).toBe(trigger.top - menuH - 4);
    expect(pos.left).toBe(500);
  });
});

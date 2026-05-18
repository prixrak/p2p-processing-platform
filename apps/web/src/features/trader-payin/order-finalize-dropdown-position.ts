const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 4;

/**
 * Fixed positioning for the pay-in finalize menu (`translateX(-100%)` aligns `left` with the menu's right edge).
 * Flips above the trigger when opening downward would overflow the viewport.
 */
export function computeTraderPayinFinalizeMenuPosition(
  trigger: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; left: number } {
  let top = trigger.bottom + TRIGGER_GAP;
  let left = trigger.right;

  if (top + menuHeight > viewportHeight - VIEWPORT_GUTTER) {
    const aboveTop = trigger.top - menuHeight - TRIGGER_GAP;
    top =
      aboveTop >= VIEWPORT_GUTTER
        ? aboveTop
        : Math.max(VIEWPORT_GUTTER, viewportHeight - menuHeight - VIEWPORT_GUTTER);
  }
  if (left - menuWidth < VIEWPORT_GUTTER) {
    left = VIEWPORT_GUTTER + menuWidth;
  }
  if (left > viewportWidth - VIEWPORT_GUTTER) {
    left = viewportWidth - VIEWPORT_GUTTER;
  }

  return { top, left };
}

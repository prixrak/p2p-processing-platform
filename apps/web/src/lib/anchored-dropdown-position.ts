const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 4;

/**
 * Positions a fixed dropdown aligned to the trigger's left edge.
 * Opens below by default and flips above when the panel would overflow the viewport bottom.
 */
export function computeDropdownBelowPosition(
  trigger: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width'>,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; left: number } {
  let top = trigger.bottom + TRIGGER_GAP;
  let left = trigger.left;

  if (top + menuHeight > viewportHeight - VIEWPORT_GUTTER) {
    const aboveTop = trigger.top - menuHeight - TRIGGER_GAP;
    top =
      aboveTop >= VIEWPORT_GUTTER
        ? aboveTop
        : Math.max(VIEWPORT_GUTTER, viewportHeight - menuHeight - VIEWPORT_GUTTER);
  }

  if (left + menuWidth > viewportWidth - VIEWPORT_GUTTER) {
    left = Math.max(VIEWPORT_GUTTER, viewportWidth - menuWidth - VIEWPORT_GUTTER);
  }
  if (left < VIEWPORT_GUTTER) {
    left = VIEWPORT_GUTTER;
  }

  return { top, left };
}

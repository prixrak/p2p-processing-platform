'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { computeTraderPayinFinalizeMenuPosition, queryVisibleAnchorTrigger } from '@/features/trader-payin/order-finalize-dropdown-position';

type MenuPosition = { top: number; left: number };

/**
 * Positions a fixed menu against a trigger element. The menu stays hidden until
 * the first successful measurement so it never flashes at (0, 0).
 */
export function useAnchoredFixedMenu(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<MenuPosition>({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return false;

    const tr = trigger.getBoundingClientRect();
    const menu = menuRef.current;
    let top = tr.bottom + 4;
    let left = tr.right;

    if (menu) {
      const next = computeTraderPayinFinalizeMenuPosition(
        tr,
        menu.offsetWidth,
        menu.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      );
      top = next.top;
      left = next.left;
    }

    setMenuPos({ top, left });
    setIsPositioned(true);
    return true;
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setIsPositioned(false);
      return;
    }

    updateMenuPosition();
    const frame = requestAnimationFrame(() => {
      updateMenuPosition();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  return { menuRef, menuPos, isPositioned };
}

/**
 * Same as {@link useAnchoredFixedMenu} but resolves the trigger via a DOM selector.
 * Used by a single shared menu portal that anchors to whichever row/modal opened it.
 */
export function useAnchoredFixedMenuBySelector(open: boolean, triggerSelector: string | null) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<MenuPosition>({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  const updateMenuPosition = useCallback(() => {
    if (!triggerSelector) return false;
    const trigger = queryVisibleAnchorTrigger(triggerSelector);
    if (!trigger) return false;

    const tr = trigger.getBoundingClientRect();
    const menu = menuRef.current;
    let top = tr.bottom + 4;
    let left = tr.right;

    if (menu) {
      const next = computeTraderPayinFinalizeMenuPosition(
        tr,
        menu.offsetWidth,
        menu.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      );
      top = next.top;
      left = next.left;
    }

    setMenuPos({ top, left });
    setIsPositioned(true);
    return true;
  }, [triggerSelector]);

  useLayoutEffect(() => {
    if (!open) {
      setIsPositioned(false);
      return;
    }

    updateMenuPosition();
    const frame = requestAnimationFrame(() => {
      updateMenuPosition();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  return { menuRef, menuPos, isPositioned };
}

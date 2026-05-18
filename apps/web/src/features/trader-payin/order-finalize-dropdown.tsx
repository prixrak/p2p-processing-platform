'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TraderPayInOrderDto } from '@p2p/shared';
import { finalizeOptionsForOrder } from './payin-finalize-utils';
import type { FinalizeKind } from './payin-types';
import { computeTraderPayinFinalizeMenuPosition } from './order-finalize-dropdown-position';

/** Which UI surface owns the open menu (table row vs detail modal share the same order id). */
export type OrderFinalizeMenuAnchor = 'table' | 'modal';

export type OrderFinalizeMenuState =
  | { anchor: OrderFinalizeMenuAnchor; orderId: string }
  | null;

export function OrderFinalizeDropdown({
  order,
  menuState,
  setMenuState,
  menuAnchor,
  onPickKind,
}: {
  order: TraderPayInOrderDto;
  menuState: OrderFinalizeMenuState;
  setMenuState: (state: OrderFinalizeMenuState) => void;
  menuAnchor: OrderFinalizeMenuAnchor;
  onPickKind: (kind: FinalizeKind) => void;
}) {
  const opts = finalizeOptionsForOrder(order);
  const open =
    opts.length > 0 &&
    menuState !== null &&
    menuState.anchor === menuAnchor &&
    menuState.orderId === order.id;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;

    const tr = trigger.getBoundingClientRect();
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
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    queueMicrotask(() => {
      updateMenuPosition();
    });
  }, [open, updateMenuPosition, opts.length]);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setMenuState]);

  const optionClasses: Record<
    Exclude<FinalizeKind, 'cancel'>,
    string
  > = {
    paid: 'border-accent-green text-accent-green hover:bg-accent-green/10',
    adjustment: 'border-accent-purple text-accent-purple hover:bg-accent-purple/10',
  };

  const menu = open && (
    <div
      ref={menuRef}
      data-trader-payin-finalize-dropdown
      className={cn(
        'flex min-w-[12.5rem] flex-col gap-1 rounded-lg border border-border-primary bg-surface-secondary p-1.5 shadow-2xl',
      )}
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        transform: 'translateX(-100%)',
        zIndex: 250,
      }}
      role="menu"
    >
      {opts.includes('paid') && (
        <button
          type="button"
          role="menuitem"
          className={cn(
            'rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
            optionClasses.paid,
          )}
          onClick={() => {
            setMenuState(null);
            onPickKind('paid');
          }}
        >
          Paid
        </button>
      )}
      {opts.includes('adjustment') && (
        <button
          type="button"
          role="menuitem"
          className={cn(
            'rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
            optionClasses.adjustment,
          )}
          onClick={() => {
            setMenuState(null);
            onPickKind('adjustment');
          }}
        >
          Adjustment
        </button>
      )}
      {opts.includes('cancel') && (
        <button
          type="button"
          role="menuitem"
          className="rounded-md border border-accent-red px-3 py-2 text-left text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/10"
          onClick={() => {
            setMenuState(null);
            onPickKind('cancel');
          }}
        >
          Canceled
        </button>
      )}
    </div>
  );

  if (opts.length === 0) {
    return null;
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="relative inline-block text-left"
        data-trader-payin-finalize-dropdown
      >
        <Button
          size="sm"
          variant="primary"
          className="gap-1"
          onClick={() =>
            setMenuState(open ? null : { anchor: menuAnchor, orderId: order.id })
          }
          aria-expanded={open}
          aria-haspopup="menu"
        >
          Change status
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </div>
      {typeof document !== 'undefined' &&
        menu &&
        createPortal(menu, document.body)}
    </>
  );
}

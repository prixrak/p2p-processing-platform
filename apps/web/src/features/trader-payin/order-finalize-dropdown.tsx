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
import type { OrderDto } from '@p2p/shared';
import { finalizeOptionsForOrder } from './payin-finalize-utils';
import type { FinalizeKind } from './payin-types';

export function OrderFinalizeDropdown({
  order,
  menuOpenOrderId,
  setMenuOpenOrderId,
  onPickKind,
}: {
  order: OrderDto;
  menuOpenOrderId: string | null;
  setMenuOpenOrderId: (id: string | null) => void;
  onPickKind: (kind: FinalizeKind) => void;
}) {
  const opts = finalizeOptionsForOrder(order);
  if (opts.length === 0) return null;

  const open = menuOpenOrderId === order.id;
  const triggerRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.right });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenOrderId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setMenuOpenOrderId]);

  const optionClasses: Record<
    Exclude<FinalizeKind, 'cancel'>,
    string
  > = {
    paid: 'border-accent-green text-accent-green hover:bg-accent-green/10',
    adjustment: 'border-accent-purple text-accent-purple hover:bg-accent-purple/10',
  };

  const menu = open && (
    <div
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
            setMenuOpenOrderId(null);
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
            setMenuOpenOrderId(null);
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
            setMenuOpenOrderId(null);
            onPickKind('cancel');
          }}
        >
          Canceled
        </button>
      )}
    </div>
  );

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
          onClick={() => setMenuOpenOrderId(open ? null : order.id)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          Change status
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </div>
      {typeof document !== 'undefined' &&
        menu &&
        createPortal(menu, document.body)}
    </>
  );
}

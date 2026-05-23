'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TraderPayInOrderDto } from '@p2p/shared';
import { finalizeOptionsForOrder } from './payin-finalize-utils';
import type { FinalizeKind } from './payin-types';
import { useAnchoredFixedMenuBySelector } from '@/lib/hooks/use-anchored-fixed-menu';

/** Which UI surface owns the open menu (table row vs detail modal share the same order id). */
export type OrderFinalizeMenuAnchor = 'table' | 'modal';

export type OrderFinalizeMenuState =
  | { anchor: OrderFinalizeMenuAnchor; orderId: string }
  | null;

export function orderFinalizeTriggerSelector(
  anchor: OrderFinalizeMenuAnchor,
  orderId: string,
): string {
  return `[data-trader-payin-finalize-trigger="${anchor}:${orderId}"]`;
}

export function OrderFinalizeDropdown({
  order,
  menuState,
  setMenuState,
  menuAnchor,
}: {
  order: TraderPayInOrderDto;
  menuState: OrderFinalizeMenuState;
  setMenuState: (state: OrderFinalizeMenuState) => void;
  menuAnchor: OrderFinalizeMenuAnchor;
}) {
  const t = useTranslations('Trader.Payin.finalize');
  const opts = finalizeOptionsForOrder(order);
  const open =
    opts.length > 0 &&
    menuState !== null &&
    menuState.anchor === menuAnchor &&
    menuState.orderId === order.id;

  if (opts.length === 0) {
    return null;
  }

  return (
    <div
      className="relative inline-block text-left"
      data-trader-payin-finalize-dropdown
    >
      <Button
        size="sm"
        variant="primary"
        className="gap-1"
        data-trader-payin-finalize-trigger={`${menuAnchor}:${order.id}`}
        onClick={() =>
          setMenuState(open ? null : { anchor: menuAnchor, orderId: order.id })
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {t('changeStatus')}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>
    </div>
  );
}

export function OrderFinalizeMenuPortal({
  menuState,
  setMenuState,
  order,
  onPickKind,
}: {
  menuState: OrderFinalizeMenuState;
  setMenuState: (state: OrderFinalizeMenuState) => void;
  order: TraderPayInOrderDto | null;
  onPickKind: (kind: FinalizeKind) => void;
}) {
  const t = useTranslations('Trader.Payin.finalize');
  const opts = order ? finalizeOptionsForOrder(order) : [];
  const open = menuState !== null && order !== null && opts.length > 0;
  const triggerSelector =
    open && menuState
      ? orderFinalizeTriggerSelector(menuState.anchor, menuState.orderId)
      : null;

  const { menuRef, menuPos, isPositioned } = useAnchoredFixedMenuBySelector(
    open,
    triggerSelector,
  );

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

  if (!open || !order) {
    return null;
  }

  const menu = (
    <div
      ref={menuRef}
      data-trader-payin-finalize-dropdown
      className={cn(
        'flex min-w-[12.5rem] flex-col gap-1 rounded-lg border border-border-primary bg-surface-secondary p-1.5 shadow-2xl',
        !isPositioned && 'pointer-events-none invisible',
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
          {t('paid')}
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
          {t('adjustment')}
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
          {t('canceled')}
        </button>
      )}
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(menu, document.body);
}

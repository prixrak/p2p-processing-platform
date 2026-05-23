'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnchoredFixedMenuBySelector } from '@/lib/hooks/use-anchored-fixed-menu';

export type AppealDecisionMenuAnchor = 'table' | 'modal';

export type AppealDecisionMenuState =
  | { anchor: AppealDecisionMenuAnchor; orderId: string; appealId: string }
  | null;

export function appealDecisionTriggerSelector(
  anchor: AppealDecisionMenuAnchor,
  orderId: string,
  appealId: string,
): string {
  return `[data-payin-appeal-decision-trigger="${anchor}:${orderId}:${appealId}"]`;
}

export function PayInAppealDecisionDropdown({
  orderId,
  appealId,
  menuState,
  setMenuState,
  menuAnchor,
  loading,
}: {
  orderId: string;
  appealId: string;
  menuState: AppealDecisionMenuState;
  setMenuState: (state: AppealDecisionMenuState) => void;
  menuAnchor: AppealDecisionMenuAnchor;
  loading: boolean;
}) {
  const t = useTranslations('Trader.Payin.appealDecision');
  const open =
    menuState !== null &&
    menuState.anchor === menuAnchor &&
    menuState.orderId === orderId &&
    menuState.appealId === appealId;

  return (
    <div
      className="relative inline-block text-left"
      data-payin-appeal-decision-dropdown
    >
      <Button
        size="sm"
        variant="secondary"
        className="gap-1"
        loading={loading}
        disabled={loading}
        data-payin-appeal-decision-trigger={`${menuAnchor}:${orderId}:${appealId}`}
        onClick={() =>
          setMenuState(open ? null : { anchor: menuAnchor, orderId, appealId })
        }
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('ariaChoose')}
      >
        {t('trigger')}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>
    </div>
  );
}

export function PayInAppealDecisionMenuPortal({
  menuState,
  setMenuState,
  loading,
  onReject,
  onAccept,
}: {
  menuState: AppealDecisionMenuState;
  setMenuState: (state: AppealDecisionMenuState) => void;
  loading: boolean;
  onReject: () => void;
  onAccept: () => void;
}) {
  const t = useTranslations('Trader.Payin.appealDecision');
  const open = menuState !== null;
  const triggerSelector = open
    ? appealDecisionTriggerSelector(
        menuState.anchor,
        menuState.orderId,
        menuState.appealId,
      )
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

  if (!open) {
    return null;
  }

  const menu = (
    <div
      ref={menuRef}
      data-payin-appeal-decision-dropdown
      className={cn(
        'flex min-w-[11rem] flex-col gap-1 rounded-lg border border-border-primary bg-surface-secondary p-1.5 shadow-2xl',
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
      aria-label={t('ariaMenu')}
    >
      <button
        type="button"
        role="menuitem"
        disabled={loading}
        className="rounded-md border border-accent-green px-3 py-2 text-left text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/10 disabled:opacity-50"
        onClick={() => {
          setMenuState(null);
          onAccept();
        }}
      >
        {t('acceptResolved')}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={loading}
        className="rounded-md border border-accent-red px-3 py-2 text-left text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/10 disabled:opacity-50"
        onClick={() => {
          setMenuState(null);
          onReject();
        }}
      >
        {t('rejectAppeal')}
      </button>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(menu, document.body);
}

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
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { computeTraderPayinFinalizeMenuPosition } from './order-finalize-dropdown-position';

export type AppealDecisionMenuAnchor = 'table' | 'modal';

export type AppealDecisionMenuState =
  | { anchor: AppealDecisionMenuAnchor; orderId: string; appealId: string }
  | null;

export function PayInAppealDecisionDropdown({
  orderId,
  appealId,
  menuState,
  setMenuState,
  menuAnchor,
  loading,
  onReject,
  onAccept,
}: {
  orderId: string;
  appealId: string;
  menuState: AppealDecisionMenuState;
  setMenuState: (state: AppealDecisionMenuState) => void;
  menuAnchor: AppealDecisionMenuAnchor;
  loading: boolean;
  onReject: () => void;
  onAccept: () => void;
}) {
  const t = useTranslations('Trader.Payin.appealDecision');
  const open =
    menuState !== null &&
    menuState.anchor === menuAnchor &&
    menuState.orderId === orderId &&
    menuState.appealId === appealId;

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
      if (e.key === 'Escape') setMenuState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setMenuState]);

  const menu = open && (
    <div
      ref={menuRef}
      data-payin-appeal-decision-dropdown
      className={cn(
        'flex min-w-[11rem] flex-col gap-1 rounded-lg border border-border-primary bg-surface-secondary p-1.5 shadow-2xl',
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

  return (
    <>
      <div
        ref={triggerRef}
        className="relative inline-block text-left"
        data-payin-appeal-decision-dropdown
      >
        <Button
          size="sm"
          variant="secondary"
          className="gap-1"
          loading={loading}
          disabled={loading}
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
      {typeof document !== 'undefined' && menu && createPortal(menu, document.body)}
    </>
  );
}

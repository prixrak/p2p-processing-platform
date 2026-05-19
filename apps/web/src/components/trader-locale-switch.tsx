'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { routing, type AppLocale } from '@/i18n/routing';

export function TraderLocaleSwitch() {
  const t = useTranslations('Trader.Language');
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const tr = triggerRef.current;
    const menu = menuRef.current;
    if (!tr) return;
    const r = tr.getBoundingClientRect();
    const menuW = menu?.offsetWidth ?? 168;
    let left = r.right;
    const top = r.bottom + 6;
    left = Math.min(left, window.innerWidth - 8);
    left = Math.max(menuW + 8, left);
    setMenuPos({ top, left });
  }, [open, locale]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as Node | null;
      if (
        triggerRef.current?.contains(el) ||
        menuRef.current?.contains(el)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function selectLocale(next: AppLocale) {
    if (!routing.locales.includes(next)) return;
    router.replace(pathname, { locale: next });
    setOpen(false);
  }

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={t('switchAria')}
        className="z-[260] min-w-[10.5rem] rounded-lg border border-border-primary bg-surface-secondary p-1 shadow-2xl ring-1 ring-black/5"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          transform: 'translateX(-100%)',
        }}
      >
        {routing.locales.map((loc) => {
          const label = loc === 'en' ? t('en') : t('uk');
          const active = loc === locale;
          return (
            <button
              key={loc}
              type="button"
              role="option"
              aria-selected={active}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                active
                  ? 'bg-accent-muted text-accent-hover'
                  : 'text-text-primary hover:bg-surface-tertiary',
              )}
              onClick={() => selectLocale(loc)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{label}</span>
                <span className="truncate text-[10px] font-normal uppercase tracking-wide text-text-muted">
                  {loc}
                </span>
              </span>
              {active ? <Check className="h-4 w-4 shrink-0 text-accent-blue" aria-hidden /> : null}
            </button>
          );
        })}
      </div>,
      document.body,
    );

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('switchAria')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border-primary bg-surface-tertiary px-2 text-text-primary transition-colors sm:px-2.5',
          'hover:border-border-secondary hover:bg-surface-elevated',
          open && 'border-border-secondary bg-surface-elevated ring-1 ring-accent-blue/25',
        )}
      >
        <Globe2 className="h-4 w-4 shrink-0 text-accent-blue" aria-hidden />
        <span className="hidden max-w-[5.5rem] truncate text-xs font-medium sm:inline">
          {locale === 'uk' ? t('uk') : t('en')}
        </span>
        <ChevronDown
          className={cn(
            'hidden h-3.5 w-3.5 shrink-0 text-text-muted transition-transform sm:block',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}

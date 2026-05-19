'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('Theme');
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-label={t('toggleAria')}
      title={isDark ? t('light') : t('dark')}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-primary bg-surface-tertiary text-text-secondary transition-colors',
        'hover:border-border-secondary hover:bg-surface-elevated hover:text-text-primary',
        'disabled:cursor-default disabled:opacity-70',
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Moon className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}

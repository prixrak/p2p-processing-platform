'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type FormAlertTone = 'error' | 'warning';

export function FormAlert({
  tone = 'error',
  children,
  className,
}: {
  tone?: FormAlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        'rounded-lg border px-4 py-3 text-sm',
        tone === 'error' &&
          'border-danger/35 bg-danger-muted text-danger shadow-[inset_0_1px_0_0_rgba(239,68,68,0.12)]',
        tone === 'warning' &&
          'border-amber-500/30 bg-amber-500/10 text-amber-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

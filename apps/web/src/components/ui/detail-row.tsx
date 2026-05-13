'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Two-line "label / value" pair used inside detail modals (pay-in, pay-out, appeals, staff).
 * Pass either a primitive `value` or arbitrary `children` for non-text content (e.g. a `Badge`).
 */
export function DetailRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      {children ?? (
        <span className={cn('text-sm text-text-primary', mono && 'font-mono text-xs')}>
          {value}
        </span>
      )}
    </div>
  );
}

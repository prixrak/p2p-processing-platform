'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

export interface LimitUsageBarProps {
  used: number;
  limit: number;
  usedSegmentLabel: string;
  remainingSegmentLabel: string;
  tooltip: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  /** When false, only renders the bar (no tooltip wrapper). */
  showTooltip?: boolean;
}

/**
 * Horizontal pill bar: used (success tint) vs remaining (accent tint), aligned with @theme tokens.
 */
export function LimitUsageBar({
  used,
  limit,
  usedSegmentLabel,
  remainingSegmentLabel,
  tooltip,
  className,
  size = 'md',
  showTooltip = true,
}: LimitUsageBarProps) {
  const safeLimit = limit > 0 ? limit : 0;
  const usedClamped = safeLimit > 0 ? Math.max(0, Math.min(used, safeLimit)) : 0;
  const remaining = safeLimit > 0 ? Math.max(0, safeLimit - usedClamped) : 0;
  const pctUsed = safeLimit > 0 ? (usedClamped / safeLimit) * 100 : 0;
  const pctRem = 100 - pctUsed;

  if (safeLimit <= 0) {
    return (
      <span className={cn('text-xs tabular-nums text-text-muted', className)} title="No limit set">
        —
      </span>
    );
  }

  const h = size === 'sm' ? 'h-5' : 'h-6';
  const showUsedLabel = pctUsed >= 12;
  const showRemLabel = pctRem >= 12;

  const bar = (
    <div
      className={cn(
        'flex w-full min-w-[7rem] overflow-hidden rounded-full border border-border-secondary bg-surface-tertiary',
        h,
      )}
      role="img"
      aria-label={`${usedClamped.toLocaleString()} of ${safeLimit.toLocaleString()} used; ${remaining.toLocaleString()} remaining`}
    >
      <div
        className={cn(
          'flex min-w-0 items-center justify-center bg-success/30 transition-[width] duration-300',
          pctUsed > 0 && pctRem > 0 && 'border-r border-border-primary/60',
        )}
        style={{ width: `${pctUsed}%`, minWidth: pctUsed > 0 ? 2 : 0 }}
      >
        {showUsedLabel ? (
          <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-text-primary">
            {usedSegmentLabel}
          </span>
        ) : null}
      </div>
      <div
        className="flex min-w-0 items-center justify-center bg-accent/22 transition-[width] duration-300"
        style={{ width: `${pctRem}%`, minWidth: pctRem > 0 ? 2 : 0 }}
      >
        {showRemLabel ? (
          <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-text-primary">
            {remainingSegmentLabel}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!showTooltip) {
    return <div className={cn('w-full', className)}>{bar}</div>;
  }

  return (
    <Tooltip content={tooltip} wide className={cn('block w-full', className)}>
      {bar}
    </Tooltip>
  );
}

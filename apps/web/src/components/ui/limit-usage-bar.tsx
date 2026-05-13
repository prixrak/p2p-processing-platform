'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

export interface LimitUsageBarProps {
  /** Amount represented by the first (green) segment. In dual mode this is total used vs limit. */
  used: number;
  limit: number;
  usedSegmentLabel: string;
  remainingSegmentLabel: string;
  tooltip: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  /** When set, the bar is split: `used` = completed (green), this = in processing (orange), remainder = blue. */
  processing?: number;
  processingSegmentLabel?: string;
  /** When false, only renders the bar (no tooltip wrapper). */
  showTooltip?: boolean;
}

function clampSeg3(limit: number, completed: number, processing: number) {
  const safeLimit = limit > 0 ? limit : 0;
  const c = safeLimit > 0 ? Math.max(0, Math.min(completed, safeLimit)) : Math.max(0, completed);
  const p =
    safeLimit > 0
      ? Math.max(0, Math.min(processing, Math.max(0, safeLimit - c)))
      : Math.max(0, processing);
  const r = Math.max(0, safeLimit - c - p);
  return { c, p, r, safeLimit };
}

function compactSegLabel(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Horizontal pill bar: usage vs remaining (dual), or completed / in processing / remaining (triple).
 */
export function LimitUsageBar({
  used,
  limit,
  usedSegmentLabel,
  remainingSegmentLabel,
  tooltip,
  className,
  size = 'md',
  processing,
  processingSegmentLabel,
  showTooltip = true,
}: LimitUsageBarProps) {
  const safeLimit = limit > 0 ? limit : 0;
  const h = size === 'sm' ? 'h-5' : 'h-6';
  const labelThresholdPct = 12;

  if (safeLimit <= 0) {
    return (
      <span className={cn('text-xs tabular-nums text-text-muted', className)} title="No limit set">
        —
      </span>
    );
  }

  const bar =
    processing !== undefined ? (
      (() => {
        const { c, p, r, safeLimit: lim } = clampSeg3(safeLimit, used, processing);
        const pctC = lim > 0 ? (c / lim) * 100 : 0;
        const pctP = lim > 0 ? (p / lim) * 100 : 0;
        const pctR = lim > 0 ? (r / lim) * 100 : 0;
        const showC = pctC >= labelThresholdPct;
        const showP = pctP >= labelThresholdPct;
        const showR = pctR >= labelThresholdPct;

        return (
          <div
            className={cn(
              'flex w-full min-w-[7rem] overflow-hidden rounded-full border border-border-secondary bg-surface-tertiary',
              h,
            )}
            role="img"
            aria-label={`Completed ${c.toLocaleString()} of ${lim.toLocaleString()}; in processing ${p.toLocaleString()}; remaining ${r.toLocaleString()}`}
          >
            <div
              className={cn(
                'flex min-w-0 items-center justify-center bg-success/30 transition-[width] duration-300',
                pctC > 0 && (pctP > 0 || pctR > 0) && 'border-r border-border-primary/60',
              )}
              style={{ width: `${pctC}%`, minWidth: pctC > 0 ? 2 : 0 }}
            >
              {showC ? (
                <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-text-primary">
                  {usedSegmentLabel}
                </span>
              ) : null}
            </div>
            <div
              className={cn(
                'flex min-w-0 items-center justify-center bg-amber-500/35 transition-[width] duration-300',
                pctP > 0 && pctR > 0 && 'border-r border-border-primary/60',
              )}
              style={{ width: `${pctP}%`, minWidth: pctP > 0 ? 2 : 0 }}
            >
              {showP ? (
                <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-text-primary">
                  {processingSegmentLabel ?? ''}
                </span>
              ) : null}
            </div>
            <div
              className="flex min-w-0 items-center justify-center bg-accent/22 transition-[width] duration-300"
              style={{ width: `${pctR}%`, minWidth: pctR > 0 ? 2 : 0 }}
            >
              {showR ? (
                <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-text-primary">
                  {compactSegLabel(r)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })()
    ) : (
      (() => {
        const usedClamped = safeLimit > 0 ? Math.max(0, Math.min(used, safeLimit)) : 0;
        const remaining = safeLimit > 0 ? Math.max(0, safeLimit - usedClamped) : 0;
        const pctUsed = safeLimit > 0 ? (usedClamped / safeLimit) * 100 : 0;
        const pctRem = 100 - pctUsed;
        const showUsedLabel = pctUsed >= labelThresholdPct;
        const showRemLabel = pctRem >= labelThresholdPct;

        return (
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
      })()
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

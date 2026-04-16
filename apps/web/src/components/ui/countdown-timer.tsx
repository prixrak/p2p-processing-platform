'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';

export interface CountdownTimerProps {
  /** Unix timestamp in seconds (external API) or milliseconds (Date.now scale). */
  targetTimestamp: number | string | Date;
  onExpire?: () => void;
  className?: string;
  showLabels?: boolean;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

/** API timestamps are Unix seconds; JS uses ms. Values below ~year 2001 in ms are treated as seconds. */
function toUnixMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function computeTimeLeft(targetMs: number): TimeLeft {
  const total = Math.max(0, targetMs - Date.now());
  return {
    hours: Math.floor(total / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1_000),
    total,
  };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function CountdownTimer({
  targetTimestamp,
  onExpire,
  className,
  showLabels = false,
}: CountdownTimerProps) {
  const targetMs =
    typeof targetTimestamp === 'number'
      ? toUnixMs(targetTimestamp)
      : new Date(targetTimestamp).getTime();

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeTimeLeft(targetMs));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(false);
    setTimeLeft(computeTimeLeft(targetMs));
  }, [targetMs]);

  const handleExpire = useCallback(() => {
    setExpired(true);
    onExpire?.();
  }, [onExpire]);

  useEffect(() => {
    if (expired) return;

    const interval = setInterval(() => {
      const tl = computeTimeLeft(targetMs);
      setTimeLeft(tl);
      if (tl.total <= 0) {
        handleExpire();
        clearInterval(interval);
      }
    }, 1_000);

    return () => clearInterval(interval);
  }, [targetMs, expired, handleExpire]);

  const isUrgent = !expired && timeLeft.total > 0 && timeLeft.total < 60_000;

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold tabular-nums',
        'border transition-colors',
        expired
          ? 'animate-pulse-soft border-accent-red/40 bg-accent-red/10 text-accent-red'
          : isUrgent
            ? 'border-accent-yellow/40 bg-accent-yellow/10 text-accent-yellow'
            : 'border-accent-green/40 bg-accent-green/10 text-accent-green',
        className,
      )}
    >
      {expired ? (
        <span>Time&apos;s up</span>
      ) : (
        <>
          <span>{pad(timeLeft.hours)}</span>
          <span className="opacity-60">:</span>
          <span>{pad(timeLeft.minutes)}</span>
          <span className="opacity-60">:</span>
          <span>{pad(timeLeft.seconds)}</span>
          {showLabels && (
            <span className="ml-1 text-xs font-normal opacity-70">
              remaining
            </span>
          )}
        </>
      )}
    </div>
  );
}

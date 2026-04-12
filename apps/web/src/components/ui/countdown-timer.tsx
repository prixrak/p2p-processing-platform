'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';

export interface CountdownTimerProps {
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

function computeTimeLeft(target: number): TimeLeft {
  const total = Math.max(0, target - Date.now());
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
  const target =
    typeof targetTimestamp === 'number'
      ? targetTimestamp
      : new Date(targetTimestamp).getTime();

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeTimeLeft(target));
  const [expired, setExpired] = useState(false);

  const handleExpire = useCallback(() => {
    setExpired(true);
    onExpire?.();
  }, [onExpire]);

  useEffect(() => {
    if (expired) return;

    const interval = setInterval(() => {
      const tl = computeTimeLeft(target);
      setTimeLeft(tl);
      if (tl.total <= 0) {
        handleExpire();
        clearInterval(interval);
      }
    }, 1_000);

    return () => clearInterval(interval);
  }, [target, expired, handleExpire]);

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
        <span>Expired</span>
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

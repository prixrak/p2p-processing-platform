import clsx, { type ClassValue } from 'clsx';
import { format } from 'date-fns';
import { twMerge } from 'tailwind-merge';

/** Wall-clock display for tables and detail rows (`2026-04-30 17:10:58`, local timezone). */
export const DISPLAY_DATETIME_SEC = 'yyyy-MM-dd HH:mm:ss';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'UAH'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ` ${currency}`;
}

/** Unix timestamp in **seconds**. */
export function formatDate(ts: number): string {
  return format(new Date(ts * 1000), DISPLAY_DATETIME_SEC);
}

/** Unix timestamp in **seconds** (same output as {@link formatDate}). */
export function formatDateFull(ts: number): string {
  return format(new Date(ts * 1000), DISPLAY_DATETIME_SEC);
}

/** `Date` instance (e.g. API ISO string parsed with `new Date(...)`). */
export function formatDateTime(date: Date): string {
  return format(date, DISPLAY_DATETIME_SEC);
}

export function shortId(id: string): string {
  return id.slice(0, 8) + '...';
}

/** Compact duration from elapsed whole seconds (for pool age / timers). */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

/** Remaining time as MM:SS while under one hour; otherwise uses compact duration. */
export function formatCountdownRemaining(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return formatDurationShort(s);
}

/**
 * Builds an URL-encoded query string from an object, **skipping** entries that are
 * `undefined`, `null`, or an empty/whitespace-only string. Numbers and booleans are
 * stringified. Returns the encoded body (no leading "?").
 *
 * Used by list pages so callers don't need to gate each filter with `if (foo) params.set(...)`.
 */
export function buildQueryString(
  entries: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v : String(v);
    if (s.length === 0) continue;
    if (typeof v === 'string' && s.trim().length === 0) continue;
    sp.set(k, s);
  }
  return sp.toString();
}

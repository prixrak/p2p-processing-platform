import { ApiError } from '@/lib/api';

const FALLBACK = 'Something went wrong. Please try again.';

function isPlausibleUserMessage(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 280) return false;
  if (/^\s*at\s+/m.test(t) || t.includes('digest:') || /\bstack\b/i.test(t)) return false;
  return true;
}

/**
 * Safe message for UI (toasts, banners). Uses API `message` when present; hides client/runtime exceptions.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const m = error.message?.trim();
    return m || FALLBACK;
  }
  if (typeof error === 'string' && error.trim()) {
    const t = error.trim();
    if (isPlausibleUserMessage(t)) return t;
    return FALLBACK;
  }
  return FALLBACK;
}

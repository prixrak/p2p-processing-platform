import { ApiError } from '@/lib/api';

/**
 * Human-readable message for UI (toasts, banners). Keeps API messages when present.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Something went wrong. Please try again.';
}

/** Query value for `reason` when the user must sign in again (expired / invalid refresh). */
export const LOGIN_SESSION_ENDED_REASON = 'session_expired';

export const LOGIN_REASON_QUERY_PARAM = 'reason';

let sessionEndedRedirectScheduled = false;

function isOnLoginPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return p === '/login' || p.startsWith('/login/');
}

/**
 * Full navigation to login with an explicit message for the user.
 * Idempotent and safe to call from multiple failure paths (refresh + 401).
 */
export function notifySessionTerminated(): void {
  if (typeof window === 'undefined') return;
  if (isOnLoginPath()) return;
  if (sessionEndedRedirectScheduled) return;
  sessionEndedRedirectScheduled = true;

  const target = new URL('/login', window.location.origin);
  target.searchParams.set(LOGIN_REASON_QUERY_PARAM, LOGIN_SESSION_ENDED_REASON);
  window.location.assign(target.toString());
}

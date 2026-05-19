import {
  clearTokens,
  getRefreshToken,
  getToken,
  setTokens,
} from '@/lib/auth';
import { notifySessionTerminated } from '@/lib/auth-session-redirect';
import { internalPaths } from '@/lib/internal-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Proactively refresh shortly before expiry to avoid flaky 401s around the boundary. */
const ACCESS_REFRESH_LEEWAY_MS = 90_000;

let refreshInFlight: Promise<boolean> | null = null;

function pathWithoutQuery(path: string): string {
  const i = path.indexOf('?');
  return i === -1 ? path : path.slice(0, i);
}

/**
 * Paths where we skip session hydration — login/refresh flows must not recurse or
 * replace tokens while an explicit credential request is running.
 */
function shouldHydrateAuthForPath(requestPath: string): boolean {
  const p = pathWithoutQuery(requestPath);
  if (p === internalPaths.authLogin) return false;
  if (p === internalPaths.authRefresh) return false;
  // 2FA completion uses tempToken in body — no Bearer access yet.
  if (p === '/api/auth/2fa/login') return false;
  if (p === internalPaths.authTwoFaVerify) return false;
  return true;
}

export { shouldHydrateAuthForPath };

/** Decode JWT `exp` (seconds) → milliseconds UTC. Exported for tests. */
export function accessTokenExpiryMs(accessToken: string): number | null {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) return null;
    const decoded = JSON.parse(atob(payloadPart)) as { exp?: number };
    if (
      decoded.exp === undefined ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp)
    ) {
      return null;
    }
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

/** Exported for tests — uses injectable clock. */
export function shouldProactivelyRefreshAccess(
  accessToken: string | null,
  refreshToken: string | null,
  nowMs: number,
  leewayMs: number,
): boolean {
  if (!refreshToken) return false;
  if (!accessToken) return true;
  const expMs = accessTokenExpiryMs(accessToken);
  if (expMs === null) return false;
  return expMs < nowMs + leewayMs;
}

function needsAccessRefresh(): boolean {
  return shouldProactivelyRefreshAccess(
    getToken(),
    getRefreshToken(),
    Date.now(),
    ACCESS_REFRESH_LEEWAY_MS,
  );
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const tokensBefore = `${getToken() ?? ''}|${getRefreshToken() ?? ''}`;

  try {
    const res = await fetch(`${API_BASE}${internalPaths.authRefresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const tokensAfter = `${getToken() ?? ''}|${getRefreshToken() ?? ''}`;
        const anotherTabRotatedTokens =
          tokensAfter !== tokensBefore && !!getRefreshToken();
        if (!anotherTabRotatedTokens) {
          clearTokens();
          notifySessionTerminated();
        }
      }
      return false;
    }

    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };

    if (!data.accessToken || !data.refreshToken) return false;

    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/** Coalesces concurrent refresh attempts (parallel 401s / tabs). */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** No-op outside the browser — RSC-safe. */
export async function ensureValidAccessToken(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!needsAccessRefresh()) return true;
  return refreshSession();
}

/** Call before guarded API routes (skips bootstrap paths internally). */
export async function hydrateSessionIfNeeded(requestPath: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!shouldHydrateAuthForPath(requestPath)) return true;
  return ensureValidAccessToken();
}

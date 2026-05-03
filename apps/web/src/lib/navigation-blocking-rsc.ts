'use client';

/**
 * Tracks blocking App Router navigations by observing fetch() calls that load
 * the RSC flight payload (same signaling Next uses internally).
 */

let blockingFlightCount = 0;
/** True after a navigational RSC flight finishes until the first mounted query wave settles. */
let routeDataTailActive = false;
let routeDataTailStartedAt = 0;
/** Any mounted observer saw fetchStatus fetching during this tail. */
let routeDataSeenObserverFetch = false;
/** Timestamp when observer fetching last dropped from >0 → 0; null while a wave is active. */
let fetchQuietStartedAt: number | null = null;
const listeners = new Set<() => void>();

export const ROUTE_DATA_MOUNT_GRACE_MS = 880;
/** Absorb waterfalls: stay visible briefly after fetching hits zero before clearing the tail. */
export const ROUTE_FETCH_QUIET_MS = 320;

let installed = false;
let originalFetch: typeof fetch | null = null;

function bump(delta: number) {
  const prev = blockingFlightCount;
  blockingFlightCount = Math.max(0, blockingFlightCount + delta);
  if (delta > 0 && blockingFlightCount > 0) {
    routeDataTailActive = false;
  }
  if (prev > 0 && blockingFlightCount === 0) {
    routeDataTailActive = true;
    routeDataTailStartedAt = Date.now();
    routeDataSeenObserverFetch = false;
    fetchQuietStartedAt = null;
  }
  listeners.forEach((l) => l());
}

export function subscribeBlockingRscNavigateCount(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBlockingRscNavigateCount() {
  return blockingFlightCount;
}

export function isRouteDataTailActive() {
  return routeDataTailActive;
}

function endRouteDataTail() {
  if (!routeDataTailActive) return;
  routeDataTailActive = false;
  routeDataSeenObserverFetch = false;
  fetchQuietStartedAt = null;
  listeners.forEach((l) => l());
}

/**
 * Keeps tail state in sync with React Query observed `fetchStatus` (mounted queries).
 * Call from subscriptions / intervals on the client.
 */
export function syncRouteDataTail(observedFetchingCount: number) {
  if (!routeDataTailActive || blockingFlightCount > 0) return;

  const now = Date.now();

  if (observedFetchingCount > 0) {
    routeDataSeenObserverFetch = true;
    fetchQuietStartedAt = null;
    return;
  }

  if (!routeDataSeenObserverFetch) {
    if (now - routeDataTailStartedAt >= ROUTE_DATA_MOUNT_GRACE_MS) {
      endRouteDataTail();
    }
    return;
  }

  if (fetchQuietStartedAt === null) {
    fetchQuietStartedAt = now;
    return;
  }

  if (now - fetchQuietStartedAt >= ROUTE_FETCH_QUIET_MS) {
    endRouteDataTail();
  }
}

export function routeDataSnapshotVisible(observedFetchingCount: number): boolean {
  if (blockingFlightCount > 0) return true;
  if (!routeDataTailActive) return false;
  const now = Date.now();
  if (observedFetchingCount > 0) return true;
  if (!routeDataSeenObserverFetch) {
    return now - routeDataTailStartedAt < ROUTE_DATA_MOUNT_GRACE_MS;
  }
  if (fetchQuietStartedAt === null) return true;
  return now - fetchQuietStartedAt < ROUTE_FETCH_QUIET_MS;
}

/**
 * True when the request matches navigation-time RSC fetches Next issues from the client.
 * Mirrors headers in Next's fetch-server-response (excludes prefetch / segment cache / dev HMR).
 */
export function isBlockingAppRouterRscNavigate(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  if (typeof window === 'undefined') return false;

  let request: Request;
  try {
    request = new Request(input, init);
  } catch {
    return false;
  }

  if (request.method !== 'GET') return false;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;

  const h = request.headers;
  if (h.get('rsc') !== '1') return false;

  // Viewport / low-priority prefetches (`fetch-server-response.js`, PrefetchKind.AUTO).
  if (h.get('next-router-prefetch') === '1') return false;

  // Experimental segment-cache background fetches (`segment-cache-impl`).
  if (h.get('next-router-segment-prefetch')) return false;

  if (h.get('next-hmr-refresh') === '1') return false;

  return true;
}

/**
 * Monkey-patch window.fetch once. Safe to call from multiple components.
 */
export function installRscNavigationFetchObserver() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const track = isBlockingAppRouterRscNavigate(input, init);
    if (!track) {
      return originalFetch!(input as RequestInfo, init);
    }

    bump(1);
    try {
      const response = await originalFetch!(input as RequestInfo, init);
      // Do not drain a cloned body: reading the Flight stream twice contends with
      // Next's decoder and can visibly delay hydration on slow links. End the global
      // bar when App Router receives the navigational Response handle.
      bump(-1);
      return response;
    } catch (error) {
      bump(-1);
      throw error;
    }
  }) as typeof fetch;
}

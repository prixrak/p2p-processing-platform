'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import {
  getBlockingRscNavigateCount,
  installRscNavigationFetchObserver,
  routeDataSnapshotVisible,
  subscribeBlockingRscNavigateCount,
  syncRouteDataTail,
} from '@/lib/navigation-blocking-rsc';

function countObservedFetchingRequests(client: QueryClient): number {
  let n = 0;
  for (const query of client.getQueryCache().getAll()) {
    if (query.getObserversCount() === 0) continue;
    if (query.state.fetchStatus === 'fetching') n += 1;
  }
  return n;
}

function subscribeNavigationCombined(
  client: QueryClient,
  onStoreChange: () => void,
) {
  const tick = () => {
    syncRouteDataTail(countObservedFetchingRequests(client));
    onStoreChange();
  };
  const unRsc = subscribeBlockingRscNavigateCount(tick);
  const qc = client.getQueryCache();
  const unQc = qc.subscribe(tick);
  const interval = window.setInterval(tick, 200);
  return () => {
    unRsc();
    unQc();
    window.clearInterval(interval);
  };
}

function getNavigationPendingSnapshot(client: QueryClient): boolean {
  const qf = countObservedFetchingRequests(client);
  if (getBlockingRscNavigateCount() > 0) return true;
  return routeDataSnapshotVisible(qf);
}

/**
 * Tracks App Router navigational RSC fetch and mounted TanStack Query fetches for the new page
 * (often a separate REST origin right after `?_rsc=…`).
 */
export function NavigationProgress() {
  installRscNavigationFetchObserver();
  const queryClient = useQueryClient();

  const pending = useSyncExternalStore(
    (onChange) => subscribeNavigationCombined(queryClient, onChange),
    () => getNavigationPendingSnapshot(queryClient),
    () => false,
  );

  if (!pending) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[600] opacity-100 transition-opacity duration-200 ease-out"
      aria-hidden
    >
      <div className="nav-progress-track relative h-[3px] w-full overflow-hidden">
        <div
          className="nav-progress-highlight absolute inset-y-0 w-[48%]"
          style={{ willChange: 'transform' }}
        />
      </div>
    </div>
  );
}

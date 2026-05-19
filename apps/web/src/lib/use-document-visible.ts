'use client';

import { useSyncExternalStore } from 'react';

export function subscribeVisibility(onStoreChange: () => void) {
  document.addEventListener('visibilitychange', onStoreChange);
  return () => document.removeEventListener('visibilitychange', onStoreChange);
}

export function getVisibilitySnapshot() {
  return document.visibilityState === 'visible';
}

function getServerVisibilitySnapshot() {
  return true;
}

/**
 * True when this tab is in the foreground. Background tabs should not hold long-lived
 * HTTP connections — browsers cap ~6 concurrent connections per origin under HTTP/1.1,
 * and multiple cabinet SSE streams per tab can block navigation/API in a second tab.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    getVisibilitySnapshot,
    getServerVisibilitySnapshot,
  );
}

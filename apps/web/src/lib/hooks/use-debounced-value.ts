'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks `value` but only commits to the returned `debounced` after `delayMs` of stable input.
 *
 * Used to throttle network queries driven by free-form text fields (search boxes), without
 * each keystroke triggering a refetch. The optional `transform` lets callers normalize the
 * value (e.g. `.trim()`) so consumers don't need a separate memo.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = 300,
  transform?: (v: T) => T,
): T {
  const init = transform ? transform(value) : value;
  const [debounced, setDebounced] = useState<T>(init);

  useEffect(() => {
    const t = setTimeout(
      () => setDebounced(transform ? transform(value) : value),
      delayMs,
    );
    return () => clearTimeout(t);
  }, [value, delayMs, transform]);

  return debounced;
}

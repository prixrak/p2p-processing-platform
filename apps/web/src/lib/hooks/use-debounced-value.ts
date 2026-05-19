'use client';

import { useEffect, useState } from 'react';

/** Default delay for text filters that drive list/API queries (search boxes, merchant name, amounts). */
export const DEFAULT_INPUT_DEBOUNCE_MS = 350;

const trimString = (v: string) => v.trim();

/**
 * Tracks `value` but only commits to the returned `debounced` after `delayMs` of stable input.
 *
 * Used to throttle network queries driven by free-form text fields (search boxes), without
 * each keystroke triggering a refetch. The optional `transform` lets callers normalize the
 * value (e.g. `.trim()`) so consumers don't need a separate memo.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = DEFAULT_INPUT_DEBOUNCE_MS,
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

/**
 * Live `value` for controlled inputs plus `debounced` (trimmed) for query keys / API params.
 * Prefer this over duplicating `useState` + `useDebouncedValue` on list pages.
 */
export function useDebouncedTextFilter(
  delayMs: number = DEFAULT_INPUT_DEBOUNCE_MS,
): {
  value: string;
  setValue: (v: string) => void;
  debounced: string;
} {
  const [value, setValue] = useState('');
  const debounced = useDebouncedValue(value, delayMs, trimString);
  return { value, setValue, debounced };
}

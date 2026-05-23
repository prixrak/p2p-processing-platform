'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_LIST_PAGE_SIZE, type ListPageSize } from '@/lib/list-pagination';
import { DEFAULT_INPUT_DEBOUNCE_MS, useDebouncedTextFilter } from './use-debounced-value';

/**
 * Encapsulates the page / search / debounced-search / status-filter state shared by all paginated list
 * pages in the cabinets (trader Pay-In, trader Pay-Out, appeals, staff users, staff orders, …).
 *
 * Behavior:
 * - `page` is reset to 1 whenever any of the filter inputs change (status, debouncedSearch, or any
 *   value passed in `resetWhen`).
 * - `page` is auto-clamped down to `totalPages` when the API response shrinks (e.g. last item removed).
 * - `setSearchInput` updates the live input value; `debouncedSearch` lags by `debounceMs` so a query
 *   isn't fired on every keystroke. Whitespace is trimmed.
 */
export function usePaginatedListState<TStatus extends string = string>(opts: {
  /** Initial rows per page. Defaults to {@link DEFAULT_LIST_PAGE_SIZE}. */
  initialPageSize?: ListPageSize;
  /** Debounce delay for the search-input → debouncedSearch transition. Defaults to 350ms. */
  debounceMs?: number;
  /** Extra dependencies that should reset page back to 1 (e.g. tab change). */
  resetWhen?: ReadonlyArray<unknown>;
}) {
  const { initialPageSize = DEFAULT_LIST_PAGE_SIZE, debounceMs = DEFAULT_INPUT_DEBOUNCE_MS, resetWhen = [] } =
    opts;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(initialPageSize);
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter(debounceMs);
  const [statusFilter, setStatusFilter] = useState<TStatus | ''>('');

  useEffect(() => {
    setPage(1);
    // Filter dependencies are explicit on purpose; pageSize is included so changing it also rewinds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch, pageSize, ...resetWhen]);

  /** Clamp `page` so it never exceeds `totalPages` after the API tells us the new max. */
  function useClampToTotalPages(totalPages: number | undefined) {
    useEffect(() => {
      if (!totalPages) return;
      if (page > totalPages) setPage(totalPages);
    }, [totalPages]);
  }

  return {
    page,
    setPage,
    searchInput,
    setSearchInput,
    debouncedSearch,
    statusFilter,
    setStatusFilter,
    pageSize,
    setPageSize,
    useClampToTotalPages,
  };
}

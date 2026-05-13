'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';

/**
 * Keeps a "selected row" piece of local state synced with the latest version of that row from a
 * listing query. When the query refetches and the row is still present, the local copy is replaced
 * so any open detail modal renders fresh data (status changes, timestamps, etc.).
 *
 * If the row drops out of the listing (e.g. status filter no longer matches), the selection is left
 * as-is — callers decide whether to keep the modal open or close it.
 */
export function useSelectedRowSync<TRow extends { id: string | number }>(
  rows: readonly TRow[] | undefined,
  selected: TRow | null,
  setSelected: Dispatch<SetStateAction<TRow | null>>,
): void {
  const selectedId = selected ? selected.id : null;

  useEffect(() => {
    if (!selected || !rows) return;
    const fresh = rows.find((r) => r.id === selectedId);
    if (fresh && fresh !== selected) setSelected(fresh);
    // We intentionally only re-run when the rows array reference or the selected id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedId]);
}

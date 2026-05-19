'use client';

import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';

export interface StatusHistoryEntry {
  status: string;
  timestamp: string;
  actor: string;
  note?: string | null;
}

/**
 * Renders a vertical list of "status • by actor • timestamp" entries inside an
 * order-details modal. Shared by admin/support/owner staff pages.
 */
export function StatusHistoryList({
  entries,
  title = 'Status History',
}: {
  entries: readonly StatusHistoryEntry[] | undefined;
  title?: string;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-text-secondary">{title}</h4>
      <div className="space-y-2">
        {entries.map((h, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Badge variant="muted">{h.status}</Badge>
              <span className="text-xs text-text-muted">by {h.actor}</span>
              {h.note ? <span className="text-xs text-text-muted">{h.note}</span> : null}
            </div>
            <span className="text-xs text-text-muted tabular-nums">
              {formatDateTime(new Date(h.timestamp))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

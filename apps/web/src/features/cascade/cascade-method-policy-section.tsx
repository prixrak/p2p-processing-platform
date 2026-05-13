'use client';

import { Loader2 } from 'lucide-react';
import type { CascadeMethodPolicy } from './cascade-types';

export function CascadeMethodPolicySection({
  data,
  isLoading,
}: {
  data: CascadeMethodPolicy | undefined;
  isLoading: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-border-primary bg-surface-secondary p-5"
      aria-label="method level cascade policy"
    >
      <h2 className="text-sm font-medium text-text-secondary">Method-level traffic (TZ v3.1)</h2>
      {isLoading ? (
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-text-muted" />
      ) : data ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-text-secondary">{data.policy}</p>
          <p className="text-text-muted">{data.assignment_note}</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Fork %</dt>
              <dd className="font-medium tabular-nums">{data.fork_traffic_percent}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Card %</dt>
              <dd className="font-medium tabular-nums">{data.card_traffic_percent}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Provider % (ledger)</dt>
              <dd className="font-medium tabular-nums">{data.provider_traffic_percent}</dd>
            </div>
          </dl>
          <p className="text-xs text-text-muted">
            Fork + Card should total ~100% for the documented routing split ({data.fork_card_sum_percent}%
            now).
          </p>
          <p
            className={`font-medium ${data.fork_card_split_matches_spec ? 'text-green-600 dark:text-green-400' : 'text-danger'}`}
          >
            Fork/Card routing split: {data.fork_card_split_matches_spec ? 'valid (≈100%)' : 'adjust Fork + Card toward 100%'}
          </p>
          <p
            className={`font-medium ${data.matches_rule ? 'text-green-600 dark:text-green-400' : 'text-danger'}`}
          >
            All three shares sum: {data.method_share_sum_percent}%
            {data.matches_rule ? ' — totals ~100% after normalization' : ' — normalization target is ~100%'}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-danger">Failed to load method policy.</p>
      )}
    </section>
  );
}

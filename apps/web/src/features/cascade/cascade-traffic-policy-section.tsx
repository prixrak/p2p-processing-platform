'use client';

import { Loader2 } from 'lucide-react';
import type { TrafficPercentPolicy } from './cascade-types';

export function CascadeTrafficPolicySection({
  data,
  isLoading,
}: {
  data: TrafficPercentPolicy | undefined;
  isLoading: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-border-primary bg-surface-secondary p-5"
      aria-label="traffic percent policy"
    >
      <h2 className="text-sm font-medium text-text-secondary">Traffic targets (traders)</h2>
      {isLoading ? (
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-text-muted" />
      ) : data ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-text-secondary">{data.policy}</p>
          <p className="text-text-muted">{data.assignment_note}</p>
          <p
            className={`font-medium ${data.matches_rule ? 'text-green-600 dark:text-green-400' : 'text-danger'}`}
          >
            Current total share (active traders accepting orders): {data.active_traders_sum_percent}%
            {data.matches_rule
              ? ' — valid'
              : ' — adjust trader targets so the group totals 100% (or all 0% for equal split)'}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-danger">Failed to load traffic policy.</p>
      )}
    </section>
  );
}

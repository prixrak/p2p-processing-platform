'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CascadeSettings } from './cascade-types';

export function CascadeGlobalSettingsSection({
  readOnly,
  settings,
  isLoading,
  draftHours,
  setDraftHours,
  draftThreshold,
  setDraftThreshold,
  draftAutolimits,
  setDraftAutolimits,
  draftCardW,
  setDraftCardW,
  draftForkW,
  setDraftForkW,
  onSave,
  savePending,
}: {
  readOnly: boolean;
  settings: CascadeSettings | undefined;
  isLoading: boolean;
  draftHours: string;
  setDraftHours: (v: string) => void;
  draftThreshold: string;
  setDraftThreshold: (v: string) => void;
  draftAutolimits: boolean;
  setDraftAutolimits: (v: boolean) => void;
  draftCardW: string;
  setDraftCardW: (v: string) => void;
  draftForkW: string;
  setDraftForkW: (v: string) => void;
  onSave: () => void;
  savePending: boolean;
}) {
  const s = settings;

  return (
    <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
      <h2 className="text-sm font-medium text-text-secondary">Global settings</h2>
      {isLoading ? (
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-text-muted" />
      ) : s ? (
        readOnly ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Sliding window (hours)</dt>
              <dd className="font-medium">{s.sliding_window_hours}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Fork autolimit threshold</dt>
              <dd className="font-medium">{s.autolimit_threshold}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Autolimits enabled</dt>
              <dd className="font-medium">{s.autolimit_enabled ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">CARD / FORK rating weights</dt>
              <dd className="font-medium">
                {s.card_rating_weight} / {s.fork_rating_weight}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Sliding window (hours)"
                type="number"
                min={1}
                max={168}
                value={draftHours}
                onChange={(e) => setDraftHours(e.target.value)}
              />
              <Input
                label="Fork autolimit threshold (0–1)"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={draftThreshold}
                onChange={(e) => setDraftThreshold(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent-blue"
                checked={draftAutolimits}
                onChange={(e) => setDraftAutolimits(e.target.checked)}
              />
              Fork autolimits enabled
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="CARD rating weight"
                type="number"
                min={1}
                value={draftCardW}
                onChange={(e) => setDraftCardW(e.target.value)}
              />
              <Input
                label="FORK rating weight"
                type="number"
                min={1}
                value={draftForkW}
                onChange={(e) => setDraftForkW(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" loading={savePending} onClick={onSave}>
              Save settings
            </Button>
          </div>
        )
      ) : (
        <p className="mt-2 text-sm text-danger">Failed to load settings.</p>
      )}
    </section>
  );
}

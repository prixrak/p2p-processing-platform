'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitFork, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CascadeSettings = {
  sliding_window_hours: number;
  autolimit_threshold: number;
  autolimit_enabled: boolean;
  card_rating_weight: number;
  fork_rating_weight: number;
};

type NominalRow = {
  id: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
};

type TrafficPercentPolicy = {
  active_traders_sum_percent: number;
  matches_rule: boolean;
  policy: string;
  assignment_note: string;
};

export type CascadeDashboardProps = {
  /** Support role: coverage/settings/nominals read-only */
  readOnly: boolean;
  subtitle?: string;
};

export function CascadeDashboard({ readOnly, subtitle }: CascadeDashboardProps) {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState('UAH');
  const [newAmount, setNewAmount] = useState('');
  const [newSort, setNewSort] = useState('');

  const [draftHours, setDraftHours] = useState('');
  const [draftThreshold, setDraftThreshold] = useState('');
  const [draftAutolimits, setDraftAutolimits] = useState(true);
  const [draftCardW, setDraftCardW] = useState('');
  const [draftForkW, setDraftForkW] = useState('');

  const settingsQ = useQuery({
    queryKey: ['admin', 'cascade', 'settings'],
    queryFn: () => api.get<CascadeSettings>(internalPaths.adminCascadeSettings),
  });

  const trafficPolicyQ = useQuery({
    queryKey: ['admin', 'cascade', 'traffic-policy'],
    queryFn: () => api.get<TrafficPercentPolicy>(internalPaths.adminCascadeTrafficPolicy),
  });

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setDraftHours(String(s.sliding_window_hours));
    setDraftThreshold(String(s.autolimit_threshold));
    setDraftAutolimits(s.autolimit_enabled);
    setDraftCardW(String(s.card_rating_weight));
    setDraftForkW(String(s.fork_rating_weight));
  }, [settingsQ.data]);

  const nominalsQ = useQuery({
    queryKey: ['admin', 'cascade', 'nominals'],
    queryFn: async () => {
      const res = await api.get<{ nominals: NominalRow[] }>(internalPaths.adminCascadeNominals);
      return res.nominals;
    },
  });

  const coverageQ = useQuery({
    queryKey: ['admin', 'cascade', 'coverage', currency],
    queryFn: () =>
      api.get<{ nominals: { nominal: number; count: number }[] }>(
        internalPaths.adminCascadeCoverage(currency),
      ),
  });

  const patchSettings = useMutation({
    mutationFn: (body: Partial<CascadeSettings>) =>
      api.patch<CascadeSettings>(internalPaths.adminCascadeSettings, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'cascade'] }),
  });

  const createNominal = useMutation({
    mutationFn: () =>
      api.post(internalPaths.adminCascadeNominals, {
        amount: Number(newAmount),
        ...(newSort.trim() !== '' ? { sort_order: Number(newSort) } : {}),
      }),
    onSuccess: () => {
      setNewAmount('');
      setNewSort('');
      void qc.invalidateQueries({ queryKey: ['admin', 'cascade'] });
    },
  });

  const patchNominal = useMutation({
    mutationFn: (vars: { id: string; is_active?: boolean; sort_order?: number }) =>
      api.patch(internalPaths.adminCascadeNominal(vars.id), {
        ...(vars.is_active !== undefined ? { is_active: vars.is_active } : {}),
        ...(vars.sort_order !== undefined ? { sort_order: vars.sort_order } : {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'cascade'] }),
  });

  const deleteNominal = useMutation({
    mutationFn: (id: string) => api.delete(internalPaths.adminCascadeNominal(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'cascade'] }),
  });

  const s = settingsQ.data;

  const submitSettings = () => {
    const sliding_window_hours = parseInt(draftHours, 10);
    const autolimit_threshold = parseFloat(draftThreshold);
    const card_rating_weight = parseInt(draftCardW, 10);
    const fork_rating_weight = parseInt(draftForkW, 10);
    if (
      Number.isNaN(sliding_window_hours) ||
      sliding_window_hours < 1 ||
      Number.isNaN(autolimit_threshold) ||
      Number.isNaN(card_rating_weight) ||
      Number.isNaN(fork_rating_weight)
    ) {
      return;
    }
    patchSettings.mutate({
      sliding_window_hours,
      autolimit_threshold,
      autolimit_enabled: draftAutolimits,
      card_rating_weight,
      fork_rating_weight,
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <GitFork className="h-8 w-8 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cascade routing</h1>
          <p className="text-sm text-text-secondary">
            {subtitle ??
              'Coverage nominals, Redis-backed coverage cache, and global cascade settings.'}
          </p>
        </div>
      </div>

      <section
        className="rounded-xl border border-border-primary bg-surface-secondary p-5"
        aria-label="traffic percent policy"
      >
        <h2 className="text-sm font-medium text-text-secondary">Traffic targets (traders)</h2>
        {trafficPolicyQ.isLoading ? (
          <Loader2 className="mt-4 h-6 w-6 animate-spin text-text-muted" />
        ) : trafficPolicyQ.data ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-text-secondary">{trafficPolicyQ.data.policy}</p>
            <p className="text-text-muted">{trafficPolicyQ.data.assignment_note}</p>
            <p
              className={`font-medium ${trafficPolicyQ.data.matches_rule ? 'text-green-600 dark:text-green-400' : 'text-danger'}`}
            >
              Current sum (active traders, accepting orders):{' '}
              {trafficPolicyQ.data.active_traders_sum_percent}%
              {trafficPolicyQ.data.matches_rule ? ' — OK' : ' — invalid (PATCH will be rejected until fixed)'}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-danger">Failed to load traffic policy.</p>
        )}
      </section>

      <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
        <h2 className="text-sm font-medium text-text-secondary">Global settings</h2>
        {settingsQ.isLoading ? (
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
              <Button
                type="button"
                size="sm"
                loading={patchSettings.isPending}
                onClick={() => submitSettings()}
              >
                Save settings
              </Button>
            </div>
          )
        ) : (
          <p className="mt-2 text-sm text-danger">Failed to load settings.</p>
        )}
      </section>

      <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-text-muted">Coverage currency</label>
            <Input
              className="mt-1 w-28"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void coverageQ.refetch()}
            disabled={coverageQ.isFetching}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${coverageQ.isFetching ? 'animate-spin' : ''}`} />
            Refresh coverage
          </Button>
        </div>
        {coverageQ.data && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-primary text-text-muted">
                  <th className="py-2 pr-4">Nominal</th>
                  <th className="py-2">Requisites</th>
                </tr>
              </thead>
              <tbody>
                {coverageQ.data.nominals.map((row) => (
                  <tr key={row.nominal} className="border-b border-border-primary/60">
                    <td className="py-2 pr-4 font-medium">{row.nominal}</td>
                    <td className="py-2">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border-primary bg-surface-secondary p-5">
        <h2 className="text-sm font-medium text-text-secondary">Nominal grid</h2>
        <p className="mt-1 text-xs text-text-muted">
          Fork auto_max hole detection uses this list. Changes invalidate Redis coverage keys.
        </p>

        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Input
              placeholder="Amount"
              type="number"
              className="w-32"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
            <Input
              placeholder="Sort order (optional)"
              type="number"
              className="w-40"
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={createNominal.isPending || newAmount.trim() === ''}
              onClick={() => createNominal.mutate()}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add nominal
            </Button>
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-primary text-text-muted">
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Sort</th>
                <th className="py-2 pr-4">Active</th>
                {!readOnly && <th className="py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(nominalsQ.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border-primary/60">
                  <td className="py-2 pr-4 font-medium">{row.amount}</td>
                  <td className="py-2 pr-4">{row.sort_order}</td>
                  <td className="py-2 pr-4">{row.is_active ? 'Yes' : 'No'}</td>
                  {!readOnly && (
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            patchNominal.mutate({ id: row.id, is_active: !row.is_active })
                          }
                        >
                          {row.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => {
                            if (confirm('Delete this nominal?')) deleteNominal.mutate(row.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

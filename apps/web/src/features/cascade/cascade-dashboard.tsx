'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitFork } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { parseDecimalInput } from '@/lib/decimal-input';
import { cascadeKeys, currencyKeys, fetchCurrencyList } from '@/lib/query-keys';
import type { CascadeSettings, NominalRow, TrafficPercentPolicy } from './cascade-types';
import { CascadeCoverageSection } from './cascade-coverage-section';
import { CascadeGlobalSettingsSection } from './cascade-global-settings-section';
import { CascadeNominalGridSection } from './cascade-nominal-grid-section';
import { CascadeTrafficPolicySection } from './cascade-traffic-policy-section';

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
    queryKey: cascadeKeys.settings(),
    queryFn: () => api.get<CascadeSettings>(internalPaths.adminCascadeSettings),
  });

  const trafficPolicyQ = useQuery({
    queryKey: cascadeKeys.trafficPolicy(),
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
    queryKey: cascadeKeys.nominals(),
    queryFn: async () => {
      const res = await api.get<{ nominals: NominalRow[] }>(internalPaths.adminCascadeNominals);
      return res.nominals;
    },
  });

  const currenciesQ = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
  });

  const currencyOptions = useMemo(() => {
    const rows = currenciesQ.data ?? [];
    const active = rows.filter((c) => c.isActive);
    const source = active.length > 0 ? active : rows;
    return source
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((c) => ({
        label: c.code.trim().toUpperCase(),
        value: c.code.trim().toUpperCase(),
      }));
  }, [currenciesQ.data]);

  useEffect(() => {
    if (currencyOptions.length === 0) return;
    const codes = new Set(currencyOptions.map((o) => o.value));
    if (!codes.has(currency)) {
      setCurrency(currencyOptions[0]!.value);
    }
  }, [currencyOptions, currency]);

  const coverageQ = useQuery({
    queryKey: cascadeKeys.coverage(currency),
    queryFn: () =>
      api.get<{ nominals: { nominal: number; count: number }[] }>(
        internalPaths.adminCascadeCoverage(currency),
      ),
  });

  const patchSettings = useMutation({
    mutationFn: (body: Partial<CascadeSettings>) =>
      api.patch<CascadeSettings>(internalPaths.adminCascadeSettings, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: cascadeKeys.scope }),
  });

  const createNominal = useMutation({
    mutationFn: () =>
      api.post(internalPaths.adminCascadeNominals, {
        amount: parseDecimalInput(newAmount),
        ...(newSort.trim() !== '' ? { sort_order: Number(newSort) } : {}),
      }),
    onSuccess: () => {
      setNewAmount('');
      setNewSort('');
      void qc.invalidateQueries({ queryKey: cascadeKeys.scope });
    },
  });

  const patchNominal = useMutation({
    mutationFn: (vars: { id: string; is_active?: boolean; sort_order?: number }) =>
      api.patch(internalPaths.adminCascadeNominal(vars.id), {
        ...(vars.is_active !== undefined ? { is_active: vars.is_active } : {}),
        ...(vars.sort_order !== undefined ? { sort_order: vars.sort_order } : {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: cascadeKeys.scope }),
  });

  const deleteNominal = useMutation({
    mutationFn: (id: string) => api.delete(internalPaths.adminCascadeNominal(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: cascadeKeys.scope }),
  });

  const s = settingsQ.data;

  const submitSettings = () => {
    const sliding_window_hours = parseInt(draftHours, 10);
    const autolimit_threshold = parseDecimalInput(draftThreshold);
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

      <CascadeTrafficPolicySection data={trafficPolicyQ.data} isLoading={trafficPolicyQ.isLoading} />

      <CascadeGlobalSettingsSection
        readOnly={readOnly}
        settings={s}
        isLoading={settingsQ.isLoading}
        draftHours={draftHours}
        setDraftHours={setDraftHours}
        draftThreshold={draftThreshold}
        setDraftThreshold={setDraftThreshold}
        draftAutolimits={draftAutolimits}
        setDraftAutolimits={setDraftAutolimits}
        draftCardW={draftCardW}
        setDraftCardW={setDraftCardW}
        draftForkW={draftForkW}
        setDraftForkW={setDraftForkW}
        onSave={() => submitSettings()}
        savePending={patchSettings.isPending}
      />

      <CascadeCoverageSection
        currency={currency}
        setCurrency={setCurrency}
        currencyOptions={currencyOptions}
        currenciesLoading={currenciesQ.isLoading}
        nominals={coverageQ.data?.nominals}
      />

      <CascadeNominalGridSection
        readOnly={readOnly}
        rows={nominalsQ.data ?? []}
        newAmount={newAmount}
        setNewAmount={setNewAmount}
        newSort={newSort}
        setNewSort={setNewSort}
        onAddNominal={() => createNominal.mutate()}
        addPending={createNominal.isPending}
        onToggleActive={(id, isActive) => patchNominal.mutate({ id, is_active: isActive })}
        onDelete={(id) => deleteNominal.mutate(id)}
      />
    </div>
  );
}

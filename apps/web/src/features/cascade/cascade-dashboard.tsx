'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitFork } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { parseDecimalInput } from '@/lib/decimal-input';
import { cascadeKeys, currencyKeys, fetchCurrencyList } from '@/lib/query-keys';
import type { CascadeMethodPolicy, CascadeSettings, NominalRow } from './cascade-types';
import { CascadeCoverageSection } from './cascade-coverage-section';
import { CascadeGlobalSettingsSection } from './cascade-global-settings-section';
import { CascadeMethodPolicySection } from './cascade-method-policy-section';
import { CascadeNominalGridSection } from './cascade-nominal-grid-section';

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

  const [draftThreshold, setDraftThreshold] = useState('');
  const [draftAutolimits, setDraftAutolimits] = useState(true);
  const [draftForkPct, setDraftForkPct] = useState('');
  const [draftCardPct, setDraftCardPct] = useState('');
  const [draftProviderPct, setDraftProviderPct] = useState('');
  const [draftLevelPickMode, setDraftLevelPickMode] = useState('DEBT');
  const [draftFillMultipliersJson, setDraftFillMultipliersJson] = useState('');
  const [fillMultipliersJsonError, setFillMultipliersJsonError] = useState<string | null>(null);

  const settingsQ = useQuery({
    queryKey: cascadeKeys.settings(),
    queryFn: () => api.get<CascadeSettings>(internalPaths.adminCascadeSettings),
  });

  const methodPolicyQ = useQuery({
    queryKey: cascadeKeys.methodPolicy(),
    queryFn: () => api.get<CascadeMethodPolicy>(internalPaths.adminCascadeMethodPolicy),
  });

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setDraftThreshold(String(s.autolimit_threshold));
    setDraftAutolimits(s.autolimit_enabled);
    setDraftForkPct(String(s.fork_traffic_percent));
    setDraftCardPct(String(s.card_traffic_percent));
    setDraftProviderPct(String(s.provider_traffic_percent));
    setDraftLevelPickMode(s.level_pick_mode);
    setDraftFillMultipliersJson(
      s.fill_multipliers_config == null
        ? ''
        : JSON.stringify(s.fill_multipliers_config, null, 2),
    );
    setFillMultipliersJsonError(null);
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
    setFillMultipliersJsonError(null);
    const autolimit_threshold = parseDecimalInput(draftThreshold);
    const fork_traffic_percent = parseDecimalInput(draftForkPct);
    const card_traffic_percent = parseDecimalInput(draftCardPct);
    const provider_traffic_percent = parseDecimalInput(draftProviderPct);
    if (
      Number.isNaN(autolimit_threshold) ||
      Number.isNaN(fork_traffic_percent) ||
      Number.isNaN(card_traffic_percent) ||
      Number.isNaN(provider_traffic_percent)
    ) {
      return;
    }
    if (
      s &&
      !s.payin_provider_integration_enabled &&
      provider_traffic_percent > 1e-9
    ) {
      return;
    }
    const level_pick_mode =
      draftLevelPickMode === 'STOCHASTIC' ? 'STOCHASTIC' : 'DEBT';

    const serverFill =
      s?.fill_multipliers_config == null
        ? ''
        : JSON.stringify(s.fill_multipliers_config, null, 2);
    const draftTrim = draftFillMultipliersJson.trim();
    const serverTrim = serverFill.trim();

    let fill_multipliers_config: unknown | undefined;
    if (draftTrim !== serverTrim) {
      if (draftTrim === '') {
        fill_multipliers_config = null;
      } else {
        try {
          fill_multipliers_config = JSON.parse(draftTrim) as unknown;
        } catch {
          setFillMultipliersJsonError('Invalid JSON');
          return;
        }
      }
    }

    patchSettings.mutate({
      autolimit_threshold,
      autolimit_enabled: draftAutolimits,
      fork_traffic_percent,
      card_traffic_percent,
      provider_traffic_percent,
      level_pick_mode,
      ...(fill_multipliers_config !== undefined ? { fill_multipliers_config } : {}),
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <GitFork className="h-8 w-8 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cascade settings</h1>
          <p className="text-sm text-text-secondary">
            {subtitle ??
              'Tier traffic, Fork fill ladder, coverage nominals, and Redis-backed cascade state.'}
          </p>
        </div>
      </div>

      <CascadeMethodPolicySection data={methodPolicyQ.data} isLoading={methodPolicyQ.isLoading} />

      <CascadeGlobalSettingsSection
        readOnly={readOnly}
        settings={s}
        isLoading={settingsQ.isLoading}
        draftThreshold={draftThreshold}
        setDraftThreshold={setDraftThreshold}
        draftAutolimits={draftAutolimits}
        setDraftAutolimits={setDraftAutolimits}
        draftForkPct={draftForkPct}
        setDraftForkPct={setDraftForkPct}
        draftCardPct={draftCardPct}
        setDraftCardPct={setDraftCardPct}
        draftProviderPct={draftProviderPct}
        setDraftProviderPct={setDraftProviderPct}
        draftLevelPickMode={draftLevelPickMode}
        setDraftLevelPickMode={setDraftLevelPickMode}
        draftFillMultipliersJson={draftFillMultipliersJson}
        setDraftFillMultipliersJson={setDraftFillMultipliersJson}
        fillMultipliersJsonError={fillMultipliersJsonError}
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

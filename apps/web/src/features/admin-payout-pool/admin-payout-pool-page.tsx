'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Percent, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { parseDecimalInput } from '@/lib/decimal-input';
import { adminPayoutPoolKeys } from '@/lib/query-keys';

interface GlobalSettings {
  pool_b_global_percent: number;
  pool_timeout_enabled: boolean;
  pool_timeout_hours: number | null;
  specialist_fail_returns_to_pool: boolean;
  updated_at: string;
}

interface MerchantRow {
  merchant_id: string;
  merchant_name: string;
  pool_b_percent: number;
  is_active: boolean;
}

export function AdminPayoutPoolPage() {
  const qc = useQueryClient();
  const [merchantSearch, setMerchantSearch] = useState('');
  const [debouncedMerchantSearch, setDebouncedMerchantSearch] = useState('');
  /** Exact `merchants.name` after picking from search; cleared when the input is edited. */
  const [pickedDisplayName, setPickedDisplayName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMerchantSearch(merchantSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [merchantSearch]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const globalQ = useQuery({
    queryKey: adminPayoutPoolKeys.global(),
    queryFn: () => api.get<GlobalSettings | null>(internalPaths.adminPayoutPoolGlobal),
  });

  const listQ = useQuery({
    queryKey: adminPayoutPoolKeys.merchants(),
    queryFn: () =>
      api.get<{ items: MerchantRow[]; total: number }>(internalPaths.adminPayoutPoolMerchants),
  });

  const directoryQ = useQuery({
    queryKey: adminPayoutPoolKeys.merchantDirectory(debouncedMerchantSearch),
    queryFn: () =>
      api.get<{ items: { merchant_id: string; display_name: string }[] }>(
        internalPaths.adminPayoutPoolMerchantDirectory(debouncedMerchantSearch),
      ),
    enabled: pickerOpen,
  });

  const patchGlobal = useMutation({
    mutationFn: (body: {
      pool_b_global_percent?: number;
      pool_timeout_enabled?: boolean;
      pool_timeout_hours?: number | null;
      specialist_fail_returns_to_pool?: boolean;
    }) => api.patch<GlobalSettings>(internalPaths.adminPayoutPoolGlobal, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminPayoutPoolKeys.scope }),
  });

  const upsertMerchant = useMutation({
    mutationFn: (body: {
      merchant_display_name: string;
      pool_b_percent: number;
      is_active?: boolean;
    }) => api.put(internalPaths.adminPayoutPoolMerchantAssignment, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminPayoutPoolKeys.merchants() });
      setMerchantSearch('');
      setDebouncedMerchantSearch('');
      setPickedDisplayName(null);
      setPickerOpen(false);
    },
  });

  const g = globalQ.data;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Percent size={24} />
          Pay-Out pool (specialist)
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Global pool B share, timeout from standard pool to specialist pool, and per-merchant
          overrides.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Global settings</h2>
        {globalQ.isLoading ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : !g ? (
          <p className="text-text-muted text-sm">No global row (run DB migration / seed).</p>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2 max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const pct = parseDecimalInput(String(fd.get('pool_b_global_percent') ?? '0'));
              const hoursRaw = String(fd.get('pool_timeout_hours') ?? '').trim();
              const hours = hoursRaw === '' ? NaN : parseInt(hoursRaw, 10);
              const enabled =
                (form.elements.namedItem('pool_timeout_enabled') as HTMLInputElement | null)
                  ?.checked ?? false;
              const failReturns =
                (form.elements.namedItem('specialist_fail_returns_to_pool') as HTMLInputElement | null)
                  ?.checked ?? false;
              patchGlobal.mutate({
                pool_b_global_percent: Number.isFinite(pct) ? pct : 0,
                pool_timeout_enabled: enabled,
                pool_timeout_hours:
                  enabled && Number.isFinite(hours) && hours >= 1 ? hours : enabled ? 24 : null,
                specialist_fail_returns_to_pool: failReturns,
              });
            }}
          >
            <Input
              name="pool_b_global_percent"
              label="Pool B global percent (0–100)"
              type="text"
              inputMode="decimal"
              defaultValue={g.pool_b_global_percent}
            />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  name="pool_timeout_enabled"
                  defaultChecked={g.pool_timeout_enabled}
                  className="rounded border-border-primary"
                />
                Enable STANDARD → specialist pool timeout
              </label>
              <Input
                name="pool_timeout_hours"
                label="Timeout (hours, unassigned STANDARD orders)"
                type="number"
                min={1}
                placeholder="e.g. 24"
                defaultValue={g.pool_timeout_hours ?? ''}
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  name="specialist_fail_returns_to_pool"
                  defaultChecked={g.specialist_fail_returns_to_pool ?? false}
                  className="rounded border-border-primary"
                />
                Specialist fail returns order to pool B (PENDING, no merchant refund)
              </label>
              <p className="text-xs text-text-muted pl-6">
                When off, failing from PROCESSING marks FAILED and refunds the merchant reserve (existing
                behaviour).
              </p>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={patchGlobal.isPending}>
                Save global settings
              </Button>
            </div>
            <p className="sm:col-span-2 text-xs text-text-muted flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Last updated: {new Date(g.updated_at).toLocaleString()}
            </p>
          </form>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Per-merchant pool B</h2>
        <form
          className="flex flex-col gap-3 max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const displayName = (pickedDisplayName ?? merchantSearch).trim();
            const pct = parseDecimalInput(String(fd.get('pool_b_percent') ?? '0'));
            const active =
              (form.elements.namedItem('is_active') as HTMLInputElement | null)?.checked ?? true;
            if (!displayName) return;
            upsertMerchant.mutate({
              merchant_display_name: displayName,
              pool_b_percent: Number.isFinite(pct) ? pct : 0,
              is_active: active,
            });
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div ref={pickerRef} className="relative min-w-[280px] flex-1">
              <Input
                id="merchant-display-name"
                label="Merchant display name"
                autoComplete="off"
                value={merchantSearch}
                onChange={(ev) => {
                  setMerchantSearch(ev.target.value);
                  setPickedDisplayName(null);
                }}
                onFocus={() => setPickerOpen(true)}
                placeholder="Search by name…"
                className="w-full"
              />
              {pickerOpen ? (
                <div
                  className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border-primary bg-surface-primary py-1 shadow-lg"
                  role="listbox"
                >
                  {directoryQ.isLoading ? (
                    <div className="px-3 py-2 text-sm text-text-muted">Loading…</div>
                  ) : (directoryQ.data?.items?.length ?? 0) === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-muted">
                      No active merchants found.
                    </div>
                  ) : (
                    directoryQ.data!.items.map((item) => (
                      <button
                        key={item.merchant_id}
                        type="button"
                        role="option"
                        className={clsx(
                          'flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-bg-secondary',
                          pickedDisplayName === item.display_name && 'bg-bg-secondary',
                        )}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setMerchantSearch(item.display_name);
                          setPickedDisplayName(item.display_name);
                          setPickerOpen(false);
                        }}
                      >
                        <span className="font-medium text-text-primary">{item.display_name}</span>
                        <span className="font-mono text-xs text-text-muted">{item.merchant_id}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <Input
              name="pool_b_percent"
              label="Pool B percent"
              type="text"
              inputMode="decimal"
              className="w-36"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary pb-2">
              <input type="checkbox" name="is_active" defaultChecked className="rounded" />
              Active
            </label>
            <Button type="submit" loading={upsertMerchant.isPending}>
              Upsert assignment
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Search and choose a merchant, or type the exact display name. Names are unique and matching is
            case-sensitive.
          </p>
        </form>

        <div className="overflow-x-auto border border-border-primary rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary text-text-muted text-left">
              <tr>
                <th className="p-3">Display name</th>
                <th className="p-3">Pool B %</th>
                <th className="p-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={3} className="p-4 text-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : (listQ.data?.items?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-text-muted">
                    No per-merchant assignments yet.
                  </td>
                </tr>
              ) : (
                listQ.data!.items.map((r) => (
                  <tr key={r.merchant_id} className="border-t border-border-primary">
                    <td className="p-3">
                      <div className="font-medium">{r.merchant_name}</div>
                      <div className="font-mono text-xs text-text-muted">{r.merchant_id}</div>
                    </td>
                    <td className="p-3 tabular-nums">{r.pool_b_percent}</td>
                    <td className="p-3">{r.is_active ? 'Yes' : 'No'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, PowerOff, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { SearchStatusRow } from '@/components/ui/list-page-tools';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { upsertSortedArrayCache } from '@/lib/query-cache-merge';
import {
  countryKeys,
  currencyKeys,
  fetchCountryList,
  fetchCurrencyList,
  mergeCreatedCountry,
  normalizeCountryListRow,
  type CountryListItem,
} from '@/lib/query-keys';
import { CATALOG_STATUS_FILTER_OPTIONS } from './catalog-filter-options';

export function CountriesPanel() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', currency: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: countryKeys.ownerList,
    queryFn: () => fetchCountryList(),
  });

  const rows = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (statusFilter === 'active' && !c.isActive) return false;
      if (statusFilter === 'inactive' && c.isActive) return false;
      if (q) {
        const hay = `${c.name} ${c.code} ${c.currency}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const { data: currencyCatalog = [] } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
    enabled: showCreate,
  });

  const countryCurrencyOptions = useMemo(() => {
    const active = currencyCatalog
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.code, label: c.code }));
    const v = form.currency.trim().toUpperCase();
    if (v && !active.some((o) => o.value === v)) {
      active.push({ value: v, label: `${v} (inactive)` });
    }
    active.sort((a, b) => a.value.localeCompare(b.value));
    return active;
  }, [currencyCatalog, form.currency]);

  const create = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<unknown>(internalPaths.adminCountries, body),
    onSuccess: (raw, vars) => {
      const row = mergeCreatedCountry(raw, {
        name: vars.name,
        code: vars.code,
        currency: vars.currency,
      });
      if (!row) return;
      upsertSortedArrayCache(qc, ['owner', 'countries'], row, {
        idOf: (c) => c.id,
        sort: (a, b) => a.name.localeCompare(b.name),
      });
      setShowCreate(false);
      setForm({ name: '', code: '', currency: '' });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<unknown>(internalPaths.adminCountry(id), { isActive: !isActive }),
    onSuccess: (raw) => {
      const row = normalizeCountryListRow(raw);
      if (!row) return;
      upsertSortedArrayCache(qc, ['owner', 'countries'], row, {
        idOf: (c) => c.id,
        sort: (a, b) => a.name.localeCompare(b.name),
      });
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Country',
      render: (c: CountryListItem) => (
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-text-muted" />
          <span className="font-medium text-text-primary">{c.name}</span>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      className: 'font-mono text-center',
      render: (c: CountryListItem) => (
        <span className="font-mono text-sm text-text-secondary">{c.code}</span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      className: 'font-mono text-center',
      render: (c: CountryListItem) => (
        <span className="font-mono text-sm font-semibold">{c.currency}</span>
      ),
    },
    {
      key: 'methods',
      header: 'Payment methods',
      className: 'text-end tabular-nums',
      render: (c: CountryListItem) => (
        <span className="text-sm text-text-muted">{c._count?.paymentMethods ?? 0}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (c: CountryListItem) => (
        <Badge color={c.isActive ? 'green' : 'red'}>{c.isActive ? 'active' : 'inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-center',
      render: (c: CountryListItem) => (
        <IconButton
          label={c.isActive ? 'Deactivate country' : 'Activate country'}
          variant={c.isActive ? 'danger' : 'success'}
          onClick={() => toggle.mutate({ id: c.id, isActive: c.isActive })}
        >
          {c.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Countries</h2>
        <p className="mt-0.5 text-sm text-text-muted">Manage geo markets and currencies</p>
      </div>

      <SearchStatusRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Country, code, or currency..."
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={CATALOG_STATUS_FILTER_OPTIONS}
        trailing={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add country
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No countries configured"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New country">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
          }}
        >
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ukraine"
            required
          />
          <Input
            label="Code (ISO 3166-1)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="UA"
            maxLength={5}
            required
          />
          <CurrencySelectWithCreate
            label="Currency"
            placeholder="Select currency"
            required
            options={countryCurrencyOptions}
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

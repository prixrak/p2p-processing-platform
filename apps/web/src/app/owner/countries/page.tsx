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
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { upsertSortedArrayCache } from '@/lib/query-cache-merge';
import { fetchCurrencyList } from '@/lib/currency-queries';

interface Country {
  id: string;
  name: string;
  code: string;
  currency: string;
  isActive: boolean;
  _count?: { paymentMethods: number };
}

export default function CountriesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', currency: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'countries'],
    queryFn: () => api.get<Country[]>(internalPaths.countries),
  });

  const { data: currencyCatalog = [] } = useQuery({
    queryKey: ['currencies'],
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
    mutationFn: (body: typeof form) => api.post<Country>(internalPaths.adminCountries, body),
    onSuccess: (row) => {
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
      api.patch<Country>(internalPaths.adminCountry(id), { isActive: !isActive }),
    onSuccess: (row) =>
      upsertSortedArrayCache(qc, ['owner', 'countries'], row, {
        idOf: (c) => c.id,
        sort: (a, b) => a.name.localeCompare(b.name),
      }),
  });

  const columns = [
    {
      key: 'name',
      header: 'Country',
      render: (c: Country) => (
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
      render: (c: Country) => (
        <span className="font-mono text-sm text-text-secondary">{c.code}</span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      className: 'font-mono text-center',
      render: (c: Country) => (
        <span className="font-mono text-sm font-semibold">{c.currency}</span>
      ),
    },
    {
      key: 'methods',
      header: 'Payment methods',
      className: 'text-end tabular-nums',
      render: (c: Country) => (
        <span className="text-sm text-text-muted">{c._count?.paymentMethods ?? 0}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (c: Country) => (
        <Badge color={c.isActive ? 'green' : 'red'}>{c.isActive ? 'active' : 'inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-center',
      render: (c: Country) => (
        <IconButton
          label={c.isActive ? 'Deactivate country' : 'Activate country'}
          variant={c.isActive ? 'danger' : 'success'}
          onClick={() => toggle.mutate({ id: c.id, isActive: c.isActive })}
        >
          {c.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Countries</h1>
          <p className="mt-1 text-sm text-text-muted">Manage geo markets and currencies</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add country
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
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

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, PowerOff } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { SearchStatusRow } from '@/components/ui/list-page-tools';
import { upsertSortedArrayCache } from '@/lib/query-cache-merge';
import { currencyKeys, fetchCurrencyList, type CurrencyListItem } from '@/lib/query-keys';
import { CATALOG_STATUS_FILTER_OPTIONS } from './catalog-filter-options';

interface Currency {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface CurrencyApiRow {
  id: string;
  code: string;
  isActive: boolean;
}

function listItemToCurrency(c: CurrencyListItem): Currency {
  return {
    id: c.id,
    code: c.code,
    name: c.code,
    status: c.isActive ? 'active' : 'inactive',
  };
}

export function CurrenciesPanel() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', name: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: currencyList = [], isLoading } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
  });

  const data = useMemo(() => currencyList.map(listItemToCurrency), [currencyList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (q && !c.code.toLowerCase().includes(q) && !(c.name || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, search, statusFilter]);

  const createCurrency = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post<CurrencyApiRow>(internalPaths.currencies, { code: payload.code.trim() }),
    onSuccess: (row) => {
      upsertSortedArrayCache(queryClient, currencyKeys.list(), row, {
        idOf: (c) => c.id,
        sort: (a, b) => a.code.localeCompare(b.code),
      });
      setShowCreate(false);
      setForm({ code: '', name: '' });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<CurrencyApiRow>(internalPaths.currency(id), {
        isActive: status !== 'active',
      }),
    onSuccess: (row) =>
      upsertSortedArrayCache(queryClient, currencyKeys.list(), row, {
        idOf: (c) => c.id,
        sort: (a, b) => a.code.localeCompare(b.code),
      }),
  });

  const columns = [
    {
      key: 'code',
      header: 'Code',
      className: 'font-mono text-end',
      render: (c: Currency) => (
        <span className="font-mono text-sm font-semibold text-text-primary">{c.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (c: Currency) => (
        <span className="text-sm text-text-secondary">{c.name || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (c: Currency) => (
        <Badge color={c.status === 'active' ? 'green' : 'red'}>{c.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-24 text-end',
      render: (c: Currency) => (
        <IconButton
          label={c.status === 'active' ? 'Deactivate currency' : 'Activate currency'}
          variant={c.status === 'active' ? 'danger' : 'success'}
          onClick={() => toggleStatus.mutate({ id: c.id, status: c.status })}
        >
          {c.status === 'active' ? (
            <PowerOff className="h-4 w-4" />
          ) : (
            <Power className="h-4 w-4" />
          )}
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Currencies</h2>
        <p className="mt-0.5 text-sm text-text-muted">Manage supported currencies</p>
      </div>

      <SearchStatusRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Code or name..."
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={CATALOG_STATUS_FILTER_OPTIONS}
        trailing={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Currency
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No currencies configured"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Currency">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createCurrency.mutate(form);
          }}
        >
          <Input
            label="Currency Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="USDT"
            maxLength={10}
            required
          />
          <Input
            label="Display Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Tether"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createCurrency.isPending}>
              Add
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

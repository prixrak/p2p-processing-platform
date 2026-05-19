'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { supportKeys } from '@/lib/query-keys';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

interface BalanceEntry {
  id: string;
  name: string;
  email: string;
  balance: number;
  frozenBalance: number;
  currency: unknown;
  status: string;
}

interface BalancesResponse {
  data: BalanceEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export default function BalancesPage() {
  const [tab, setTab] = useState('traders');
  const [page, setPage] = useState(1);
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const { data, isLoading } = useQuery({
    queryKey: supportKeys.balances(tab, page, debouncedSearch),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      return api.get<BalancesResponse>(internalPaths.supportBalances(tab, params.toString()));
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (b: BalanceEntry) => (
        <div>
          <p className="font-medium text-text-primary">{b.name}</p>
          <p className="text-xs text-text-muted">{b.email}</p>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Available Balance',
      className: 'text-end tabular-nums',
      render: (b: BalanceEntry) => {
        const code = currencyCodeFromUnknown(b.currency);
        return (
        <span className="font-mono text-sm font-medium text-text-primary">
          {b.balance.toLocaleString()} {code}
        </span>
        );
      },
    },
    {
      key: 'frozen',
      header: 'Frozen',
      className: 'text-end tabular-nums',
      render: (b: BalanceEntry) => {
        const code = currencyCodeFromUnknown(b.currency);
        return (
        <span className={`font-mono text-sm ${b.frozenBalance > 0 ? 'text-warning' : 'text-text-muted'}`}>
          {b.frozenBalance.toLocaleString()} {code}
        </span>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-end tabular-nums',
      render: (b: BalanceEntry) => {
        const code = currencyCodeFromUnknown(b.currency);
        return (
        <span className="font-mono text-sm font-medium text-accent">
          {(b.balance + b.frozenBalance).toLocaleString()} {code}
        </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (b: BalanceEntry) => (
        <Badge color={b.status === 'active' ? 'green' : 'red'}>{b.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Balances</h1>
        <p className="mt-1 text-sm text-text-muted">Read-only overview of trader and merchant balances</p>
      </div>

      <Tabs
        tabs={[
          { key: 'traders', label: 'Trader Balances' },
          { key: 'merchants', label: 'Merchant Balances' },
        ]}
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); setSearchInput(''); }}
      />

      <FilterBar>
        <FilterInput
          label="Search"
          value={searchInput}
          onChange={setSearchInput}
          placeholder={`Search ${tab}...`}
          className="w-64 min-w-[12rem]"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage={`No ${tab} found`}
      />
    </div>
  );
}

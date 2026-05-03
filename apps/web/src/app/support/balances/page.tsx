'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { supportKeys } from '@/lib/query-keys';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, FilterInput } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';

interface BalanceEntry {
  id: string;
  name: string;
  email: string;
  balance: number;
  frozenBalance: number;
  currency: string;
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
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: supportKeys.balances(tab, page, search),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
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
      render: (b: BalanceEntry) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {b.balance.toLocaleString()} {b.currency}
        </span>
      ),
    },
    {
      key: 'frozen',
      header: 'Frozen',
      className: 'text-end tabular-nums',
      render: (b: BalanceEntry) => (
        <span className={`font-mono text-sm ${b.frozenBalance > 0 ? 'text-warning' : 'text-text-muted'}`}>
          {b.frozenBalance.toLocaleString()} {b.currency}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-end tabular-nums',
      render: (b: BalanceEntry) => (
        <span className="font-mono text-sm font-medium text-accent">
          {(b.balance + b.frozenBalance).toLocaleString()} {b.currency}
        </span>
      ),
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
        onChange={(k) => { setTab(k); setPage(1); setSearch(''); }}
      />

      <FilterBar>
        <FilterInput
          label="Search"
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
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

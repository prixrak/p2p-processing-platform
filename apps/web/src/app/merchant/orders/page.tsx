'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  FiltersToggleButton,
  ListPageHeader,
  SearchStatusRow,
} from '@/components/ui/list-page-tools';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { merchantKeys } from '@/lib/query-keys';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { FilterInput } from '@/components/ui/filters';
import { format } from 'date-fns';
import {
  ORDER_LIST_UI_TAB,
  orderListUiTabToDirection,
  type OrderListUiTab,
} from '@p2p/shared';
import { payinStatusFilterOptions, payoutStatusFilterOptions } from '@/lib/order-status-ui';

interface MerchantOrder {
  id: string;
  externalId: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  customerEmail: string | null;
  createdAt: string;
  completedAt: string | null;
}

export default function MerchantOrdersPage() {
  const [tab, setTab] = useState<OrderListUiTab>(ORDER_LIST_UI_TAB.PAY_IN);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const direction = orderListUiTabToDirection(tab);

  const statusFilterOptions = useMemo(
    () => (tab === ORDER_LIST_UI_TAB.PAY_IN ? payinStatusFilterOptions : payoutStatusFilterOptions),
    [tab],
  );

  const { data: orders = [], isLoading } = useQuery<MerchantOrder[]>({
    queryKey: merchantKeys.orders({
      direction,
      statusFilter,
      debouncedSearch,
      dateFrom,
      dateTo,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ direction });
      if (statusFilter) params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get(internalPaths.merchantOrders(params.toString()));
    },
  });

  const columns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: MerchantOrder) => (
        <span className="font-mono text-xs text-text-muted">{row.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'externalId',
      header: 'External ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: MerchantOrder) => (
        <span className="font-mono text-xs">{row.externalId?.slice(0, 12) ?? '—'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: MerchantOrder) => (
        <span className="font-mono text-text-primary">
          {row.amount.toLocaleString()} {row.currency}
        </span>
      ),
    },
    { key: 'paymentMethod', header: 'Method' },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: MerchantOrder) => <StatusBadge status={row.status} />,
    },
    {
      key: 'customerEmail',
      header: 'Customer',
      render: (row: MerchantOrder) => (
        <span className="text-text-muted text-xs">{row.customerEmail ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: MerchantOrder) => (
        <span className="text-xs text-text-muted">
          {format(new Date(row.createdAt), 'dd.MM.yy HH:mm')}
        </span>
      ),
    },
    {
      key: 'completedAt',
      header: 'Completed',
      render: (row: MerchantOrder) => (
        <span className="text-xs text-text-muted">
          {row.completedAt
            ? format(new Date(row.completedAt), 'dd.MM.yy HH:mm')
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ArrowLeftRight size={24} />
            Orders
          </h1>
        }
        description="View and track your payment orders"
        actions={
          <>
            <Tabs
              tabs={[
                { key: ORDER_LIST_UI_TAB.PAY_IN, label: 'Pay-In' },
                { key: ORDER_LIST_UI_TAB.PAY_OUT, label: 'Pay-Out' },
              ]}
              active={tab}
              onChange={(k) => {
                setTab(k as OrderListUiTab);
                setStatusFilter('');
              }}
            />
            <FiltersToggleButton
              expanded={showFilters}
              onToggle={() => setShowFilters((v) => !v)}
            />
          </>
        }
      />

      <SearchStatusRow
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Order or external ID..."
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={statusFilterOptions}
      />

      {showFilters && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FilterInput
              label="From"
              type="date"
              value={dateFrom}
              onChange={setDateFrom}
            />
            <FilterInput
              label="To"
              type="date"
              value={dateTo}
              onChange={setDateTo}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear dates
            </Button>
          </div>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={orders}
        keyExtractor={(o) => o.id}
        isLoading={isLoading}
        emptyMessage="No orders found"
      />
    </div>
  );
}

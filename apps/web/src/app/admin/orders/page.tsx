'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, FilterSelect, FilterInput } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { format } from 'date-fns';
import { payinStatusFilterOptions, payoutStatusFilterOptions } from '@/lib/order-status-ui';

interface Order {
  id: string;
  externalId: string;
  type: string;
  merchantName: string;
  traderName: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

interface TraderOption {
  id: string;
  name: string;
}

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pay-in');
  const [statusFilter, setStatusFilter] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [traderFilter, setTraderFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [assigningOrder, setAssigningOrder] = useState<string | null>(null);
  const [selectedTrader, setSelectedTrader] = useState('');

  const direction = tab === 'pay-in' ? 'PAY_IN' : 'PAY_OUT';

  const statusFilterOptions = useMemo(
    () => (tab === 'pay-in' ? payinStatusFilterOptions : payoutStatusFilterOptions),
    [tab],
  );

  interface AdminOrdersResponse {
    data: Order[];
    total: number;
    page: number;
    totalPages: number;
  }

  const { data: ordersData, isLoading } = useQuery<AdminOrdersResponse>({
    queryKey: ['admin', 'orders', { direction, statusFilter, merchantFilter, traderFilter, dateFrom, dateTo }],
    queryFn: () => {
      const params = new URLSearchParams({ direction });
      if (statusFilter) params.set('status', statusFilter);
      if (merchantFilter) params.set('merchant', merchantFilter);
      if (traderFilter) params.set('trader', traderFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get<AdminOrdersResponse>(internalPaths.adminOrders(params.toString()));
    },
  });
  const orders = ordersData?.data ?? [];

  const { data: traders = [] } = useQuery<TraderOption[]>({
    queryKey: ['admin', 'traders', 'options'],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ id: string; user: { email: string } }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((t) => ({ id: t.id, name: t.user.email }));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ orderId, traderId }: { orderId: string; traderId: string }) =>
      api.post(internalPaths.payoutAssign, { orderId, traderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      setAssigningOrder(null);
      setSelectedTrader('');
    },
  });

  const columns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: Order) => (
        <span className="font-mono text-xs text-text-muted">{row.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'externalId',
      header: 'External ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: Order) => (
        <span className="font-mono text-xs">{row.externalId?.slice(0, 12) ?? '—'}</span>
      ),
    },
    {
      key: 'merchantName',
      header: 'Merchant',
      render: (row: Order) => <span className="text-text-primary">{row.merchantName}</span>,
    },
    {
      key: 'traderName',
      header: 'Trader',
      render: (row: Order) => (
        <span className={row.traderName ? 'text-text-primary' : 'text-text-muted'}>
          {row.traderName ?? 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: Order) => (
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
      render: (row: Order) => <StatusBadge status={row.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: Order) => (
        <span className="text-xs text-text-muted">
          {format(new Date(row.createdAt), 'dd.MM.yy HH:mm')}
        </span>
      ),
    },
    ...(tab === 'pay-out'
        ? [
          {
            key: 'assign' as const,
            header: '',
            className: 'text-end',
            render: (row: Order) =>
              !row.traderName ? (
                assigningOrder === row.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Select
                      options={[
                        { value: '', label: 'Select trader' },
                        ...traders.map((t) => ({ value: t.id, label: t.name })),
                      ]}
                      value={selectedTrader}
                      onChange={(e) => setSelectedTrader(e.target.value)}
                      className="min-h-9 min-w-[12rem] max-w-[16rem] !py-1.5 !text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={!selectedTrader}
                      loading={assignMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        assignMutation.mutate({
                          orderId: row.id,
                          traderId: selectedTrader,
                        });
                      }}
                    >
                      Assign
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssigningOrder(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningOrder(row.id);
                    }}
                  >
                    Assign
                  </Button>
                )
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <ArrowLeftRight size={24} />
          Orders
        </h1>
        <p className="text-sm text-text-muted mt-1">
          View and manage all platform orders
        </p>
      </div>

      <Tabs
        tabs={[
          { key: 'pay-in', label: 'Pay-In' },
          { key: 'pay-out', label: 'Pay-Out' },
        ]}
        active={tab}
        onChange={(k) => {
          setTab(k);
          setStatusFilter('');
        }}
      />

      <FilterBar>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusFilterOptions}
        />
        <FilterInput
          label="Merchant"
          value={merchantFilter}
          onChange={setMerchantFilter}
          placeholder="Merchant name..."
        />
        <FilterInput
          label="Trader"
          value={traderFilter}
          onChange={setTraderFilter}
          placeholder="Trader name..."
        />
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
      </FilterBar>

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

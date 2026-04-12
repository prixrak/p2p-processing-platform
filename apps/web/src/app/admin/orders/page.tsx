'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, FilterSelect, FilterInput } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

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

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['admin', 'orders', { direction, statusFilter, merchantFilter, traderFilter, dateFrom, dateTo }],
    queryFn: () => {
      const params = new URLSearchParams({ direction });
      if (statusFilter) params.set('status', statusFilter);
      if (merchantFilter) params.set('merchant', merchantFilter);
      if (traderFilter) params.set('trader', traderFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get(`/api/admin/orders?${params}`);
    },
  });

  const { data: traders = [] } = useQuery<TraderOption[]>({
    queryKey: ['admin', 'traders', 'options'],
    queryFn: () => api.get('/api/admin/traders/options'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ orderId, traderId }: { orderId: string; traderId: string }) =>
      api.post(`/api/admin/orders/${orderId}/assign`, { traderId }),
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
      render: (row) => (
        <span className="font-mono text-xs text-text-muted">{row.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'externalId',
      header: 'External ID',
      render: (row) => (
        <span className="font-mono text-xs">{row.externalId?.slice(0, 12) ?? '—'}</span>
      ),
    },
    {
      key: 'merchantName',
      header: 'Merchant',
      render: (row) => <span className="text-text-primary">{row.merchantName}</span>,
    },
    {
      key: 'traderName',
      header: 'Trader',
      render: (row) => (
        <span className={row.traderName ? 'text-text-primary' : 'text-text-muted'}>
          {row.traderName ?? 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="font-mono text-text-primary">
          {row.amount.toLocaleString()} {row.currency}
        </span>
      ),
    },
    { key: 'paymentMethod', header: 'Method' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
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
            render: (row: Order) =>
              !row.traderName ? (
                assigningOrder === row.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={selectedTrader}
                      onChange={(e) => setSelectedTrader(e.target.value)}
                      className="px-2 py-1 text-xs bg-bg-input border border-border-primary rounded text-text-primary"
                    >
                      <option value="">Select trader</option>
                      {traders.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
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
        onChange={setTab}
      />

      <FilterBar>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'new', label: 'New' },
            { value: 'pending', label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'awaiting_payment', label: 'Awaiting Payment' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'expired', label: 'Expired' },
            { value: 'disputed', label: 'Disputed' },
          ]}
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

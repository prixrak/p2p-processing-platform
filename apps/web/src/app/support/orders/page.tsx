'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { IconButton } from '@/components/ui/icon-button';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';

interface Order {
  id: string;
  type: 'PAYIN' | 'PAYOUT';
  merchantName: string;
  traderName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface OrdersResponse {
  data: Order[];
  total: number;
  page: number;
  totalPages: number;
}

interface OrderDetails {
  id: string;
  type: string;
  merchantName: string;
  traderName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requisites?: { bank: string; cardNumber: string };
  statusHistory: { status: string; timestamp: string; actor: string }[];
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DISPUTE', label: 'Dispute' },
  { value: 'FAILED', label: 'Failed' },
];

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  COMPLETED: 'green',
  ACTIVE: 'blue',
  PENDING: 'yellow',
  FAILED: 'red',
  CANCELLED: 'red',
  DISPUTE: 'red',
};

export default function SupportOrdersPage() {
  const [tab, setTab] = useState('PAYIN');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [traderFilter, setTraderFilter] = useState('');
  const [detailOrder, setDetailOrder] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['support', 'orders', tab, page, statusFilter, merchantFilter, traderFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        type: tab,
        page: String(page),
        limit: '20',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (merchantFilter) params.set('merchant', merchantFilter);
      if (traderFilter) params.set('trader', traderFilter);
      return api.get<OrdersResponse>(`/api/support/orders?${params}`);
    },
  });

  const { data: details } = useQuery({
    queryKey: ['support', 'order-details', detailOrder],
    queryFn: () => api.get<OrderDetails>(`/api/support/orders/${detailOrder}`),
    enabled: !!detailOrder,
  });

  const columns = [
    {
      key: 'id',
      header: 'Order ID',
      className: 'font-mono tabular-nums text-end',
      render: (o: Order) => (
        <span className="font-mono text-sm text-text-primary">{o.id.slice(0, 12)}</span>
      ),
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (o: Order) => (
        <span className="text-sm text-text-secondary">{o.merchantName}</span>
      ),
    },
    {
      key: 'trader',
      header: 'Trader',
      render: (o: Order) => (
        <span className="text-sm text-text-secondary">{o.traderName || '—'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (o: Order) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {o.amount.toLocaleString()} {o.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (o: Order) => (
        <Badge color={statusColor[o.status] ?? 'default'}>{o.status}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (o: Order) => (
        <span className="text-sm text-text-muted">
          {new Date(o.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-center',
      render: (o: Order) => (
        <IconButton label="View order details" onClick={() => setDetailOrder(o.id)}>
          <Eye className="h-3.5 w-3.5" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
        <p className="mt-1 text-sm text-text-muted">Read-only view of all platform orders</p>
      </div>

      <Tabs
        tabs={[
          { key: 'PAYIN', label: 'Pay-In' },
          { key: 'PAYOUT', label: 'Pay-Out' },
        ]}
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
      />

      <FilterBar>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={statusOptions}
          placeholder="Status"
          className="w-40"
        />
        <FilterInput
          label="Merchant"
          value={merchantFilter}
          onChange={(v) => { setMerchantFilter(v); setPage(1); }}
          placeholder="Merchant name..."
          className="w-48 min-w-[10rem]"
        />
        <FilterInput
          label="Trader"
          value={traderFilter}
          onChange={(v) => { setTraderFilter(v); setPage(1); }}
          placeholder="Trader name..."
          className="w-48 min-w-[10rem]"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No orders found"
      />

      <Modal
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={`Order — ${detailOrder?.slice(0, 12) ?? ''}`}
        className="max-w-2xl"
      >
        {details && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Type</p>
                <p className="font-medium text-text-primary">{details.type}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Status</p>
                <Badge color={statusColor[details.status] ?? 'default'}>{details.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted">Amount</p>
                <p className="font-mono font-medium text-text-primary">
                  {details.amount.toLocaleString()} {details.currency}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Created</p>
                <p className="text-sm text-text-secondary">
                  {new Date(details.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Merchant</p>
                <p className="text-sm text-text-primary">{details.merchantName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Trader</p>
                <p className="text-sm text-text-primary">{details.traderName || '—'}</p>
              </div>
            </div>

            {details.requisites && (
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
                <p className="mb-1 text-xs text-text-muted">Requisites</p>
                <p className="text-sm text-text-primary">{details.requisites.bank}</p>
                <p className="font-mono text-sm text-text-secondary">
                  {details.requisites.cardNumber}
                </p>
              </div>
            )}

            {details.statusHistory?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Status History</h4>
                <div className="space-y-2">
                  {details.statusHistory.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge color={statusColor[h.status] ?? 'default'}>{h.status}</Badge>
                        <span className="text-xs text-text-muted">by {h.actor}</span>
                      </div>
                      <span className="text-xs text-text-muted">
                        {new Date(h.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  RefreshCw,
  Filter,
  Timer,
  Eye,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { usePayinTraderRealtime } from '@/lib/payin-realtime';
import { formatCurrency, formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { payinStatusVariant } from '@/lib/status-helpers';
import { PayInOrderStatus } from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';

interface PayInListApiResponse {
  items: OrderDto[];
  total: number;
  page: number;
  limit: number;
}

function CountdownTimer({ autocloseAt }: { autocloseAt: number | null }) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!autocloseAt) return;

    function update() {
      const diff = autocloseAt! * 1000 - Date.now();
      setRemaining(Math.max(0, diff));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [autocloseAt]);

  if (!autocloseAt) return <span className="text-text-muted">-</span>;

  const isExpired = remaining <= 0;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <span
      className={cn(
        'font-mono text-sm font-medium',
        isExpired ? 'text-accent-red animate-pulse-soft' : 'text-accent-green',
      )}
    >
      {isExpired ? 'EXPIRED' : `${minutes}:${seconds.toString().padStart(2, '0')}`}
    </span>
  );
}

export default function PayInOrdersPage() {
  const queryClient = useQueryClient();
  usePayinTraderRealtime(queryClient);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const queryParams: Record<string, string> = {};
  if (statusFilter) queryParams.status = statusFilter;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'payin-orders', queryParams],
    queryFn: async () => {
      const res = await api.get<PayInListApiResponse>('/api/trader/payin/orders', queryParams);
      return { orders: res.items, total: res.total };
    },
  });

  useEffect(() => {
    if (!selectedOrder || !data?.orders) return;
    const fresh = data.orders.find((o) => o.id === selectedOrder.id);
    if (fresh) setSelectedOrder(fresh);
  }, [data?.orders, selectedOrder?.id]);

  const confirmMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payin/orders/${orderId}/confirm`, { orderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payin-orders'] });
      setSelectedOrder(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payin/orders/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payin-orders'] });
      setSelectedOrder(null);
    },
  });

  const statusOptions = Object.values(PayInOrderStatus).map((s) => ({
    value: s,
    label: s,
  }));

  const columns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: OrderDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: OrderDto) => (
        <span className="font-medium">{formatCurrency(row.amount)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: OrderDto) => (
        <Badge variant={payinStatusVariant[row.status]} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'timer',
      header: 'Timer',
      className: 'text-end font-mono tabular-nums',
      render: (row: OrderDto) => <CountdownTimer autocloseAt={row.autoclose_at} />,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: OrderDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (row: OrderDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === PayInOrderStatus.VERIFIED && (
            <Button
              size="sm"
              variant="success"
              onClick={() => confirmMutation.mutate(row.id)}
              loading={confirmMutation.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm receipt
            </Button>
          )}
          {(row.status === PayInOrderStatus.NEW || row.status === PayInOrderStatus.VERIFIED) && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => cancelMutation.mutate(row.id)}
              loading={cancelMutation.isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          <IconButton label="View order details" onClick={() => setSelectedOrder(row)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowDownToLine className="h-6 w-6 text-accent-green" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Pay-In Orders</h1>
            <p className="text-sm text-text-muted">
              {data?.total ?? 0} total orders
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="animate-slide-up">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Status"
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="All statuses"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
              }}
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      <Table
        columns={columns}
        data={data?.orders ?? []}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => setSelectedOrder(row)}
        emptyMessage="No pay-in orders found"
      />

      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title="Pay-In Order Details"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedOrder.id} mono />
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <DetailRow label="Amount" value={formatCurrency(selectedOrder.amount)} />
              <DetailRow label="Currency" value={selectedOrder.currency || '—'} />
              <DetailRow label="Commission" value={formatCurrency(selectedOrder.commission)} />
              <DetailRow label="Partner Amount" value={formatCurrency(selectedOrder.partner_amount)} />
              <DetailRow label="Rate" value={String(selectedOrder.rate)} />
              <DetailRow label="Status">
                <Badge variant={payinStatusVariant[selectedOrder.status]} dot>
                  {selectedOrder.status}
                </Badge>
              </DetailRow>
              <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              <DetailRow label="Bank" value={selectedOrder.bank || '-'} />
              <DetailRow label="Requisite" value={selectedOrder.requisite_number || '-'} mono />
              <DetailRow label="Owner" value={selectedOrder.requisite_owner || '-'} />
              <DetailRow label="Timer">
                <CountdownTimer autocloseAt={selectedOrder.autoclose_at} />
              </DetailRow>
            </div>

            {selectedOrder.appeals && selectedOrder.appeals.length > 0 && (
              <div className="rounded-lg border border-border-primary p-4">
                <h3 className="mb-2 text-sm font-medium text-text-secondary">Appeals</h3>
                {selectedOrder.appeals.map((appeal) => (
                  <div key={appeal.id} className="flex items-center gap-4 text-sm">
                    <Badge variant={appeal.status === 'OPEN' ? 'warning' : appeal.status === 'RESOLVED' ? 'success' : 'danger'}>
                      {appeal.status}
                    </Badge>
                    <span>Paid: {formatCurrency(appeal.paid_amount)}</span>
                    <span className="text-text-muted">{formatDate(appeal.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedOrder.status === PayInOrderStatus.NEW && (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Waiting for payer:</span> they must confirm
                they sent the transfer (status becomes VERIFIED). Only then you can confirm you received the
                funds. You can cancel this order if needed.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {selectedOrder.status === PayInOrderStatus.VERIFIED && (
                <Button
                  variant="success"
                  onClick={() => confirmMutation.mutate(selectedOrder.id)}
                  loading={confirmMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm receipt
                </Button>
              )}
              {(selectedOrder.status === PayInOrderStatus.NEW ||
                selectedOrder.status === PayInOrderStatus.VERIFIED) && (
                <Button
                  variant="danger"
                  onClick={() => cancelMutation.mutate(selectedOrder.id)}
                  loading={cancelMutation.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel order
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      {children ?? (
        <span className={cn('text-sm text-text-primary', mono && 'font-mono text-xs')}>
          {value}
        </span>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpFromLine,
  RefreshCw,
  Filter,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
  Layers,
  ListTodo,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { usePayOutTraderRealtime } from '@/lib/payin-realtime';
import { formatCurrency, formatDate, formatDateFull, shortId, cn } from '@/lib/utils';
import { payoutStatusVariant } from '@/lib/status-helpers';
import { PayOutOrderStatus, PAYOUT_TRADER_HISTORY_STATUSES } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';

interface PayOutListResponse {
  orders: PayOutOrderApiDto[];
  total: number;
}

type TabType = 'new' | 'in_progress' | 'history';

export default function PayOutOrdersPage() {
  const queryClient = useQueryClient();
  usePayOutTraderRealtime(queryClient);
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PayOutOrderApiDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: inProgressData, isLoading: inProgressLoading, refetch: refetchInProgress } =
    useQuery({
      queryKey: ['trader', 'payout-orders', { queue: 'in_progress' }],
      queryFn: () =>
        api.get<PayOutListResponse>('/api/trader/payout/orders', { queue: 'in_progress' }),
    });

  const historyListParams: Record<string, string> = { queue: 'history' };
  if (statusFilter) historyListParams.status = statusFilter;

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['trader', 'payout-orders', historyListParams],
    queryFn: () => api.get<PayOutListResponse>('/api/trader/payout/orders', historyListParams),
  });

  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery({
    queryKey: ['trader', 'payout-pool'],
    queryFn: () => api.get<PayOutListResponse>('/api/trader/payout/pool'),
  });

  useEffect(() => {
    if (!selectedOrder) return;
    const fromInProgress = inProgressData?.orders?.find((o) => o.id === selectedOrder.id);
    const fromHistory = historyData?.orders?.find((o) => o.id === selectedOrder.id);
    const fromPool = poolData?.orders?.find((o) => o.id === selectedOrder.id);
    const fresh = fromInProgress ?? fromHistory ?? fromPool;
    if (fresh) setSelectedOrder(fresh);
  }, [inProgressData?.orders, historyData?.orders, poolData?.orders, selectedOrder?.id]);

  const takeFromPoolMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/take`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-pool'] });
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
    },
  });

  const processMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/process`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
      setSelectedOrder(null);
    },
  });

  const failMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payout/orders/${orderId}/fail`, {
        orderId,
        reason: 'Marked as failed by trader',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payout-orders'] });
      setSelectedOrder(null);
    },
  });

  const historyStatusOptions = PAYOUT_TRADER_HISTORY_STATUSES.map((s) => ({
    value: s,
    label: s,
  }));

  const poolColumns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-semibold text-accent-blue">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-secondary">{row.currency}</span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.details.number}</span>
          {row.details.owner && (
            <span className="text-xs text-text-muted">{row.details.owner}</span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => takeFromPoolMutation.mutate(row.id)}
            loading={takeFromPoolMutation.isPending}
          >
            <Play className="h-3.5 w-3.5" />
            Take
          </Button>
          <IconButton label="View order details" onClick={() => setSelectedOrder(row)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  const ordersColumns = [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-secondary">{row.currency}</span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.details.number}</span>
          {row.details.owner && (
            <span className="text-xs text-text-muted">{row.details.owner}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => (
        <Badge variant={payoutStatusVariant[row.status]} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === PayOutOrderStatus.NEW && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => processMutation.mutate(row.id)}
              loading={processMutation.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              Process
            </Button>
          )}
          {row.status === PayOutOrderStatus.PROCESSING && (
            <>
              <Button
                size="sm"
                variant="success"
                onClick={() => completeMutation.mutate(row.id)}
                loading={completeMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => failMutation.mutate(row.id)}
                loading={failMutation.isPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Fail
              </Button>
            </>
          )}
          <IconButton label="View order details" onClick={() => setSelectedOrder(row)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  const handleRefetch = () => {
    if (activeTab === 'new') void refetchPool();
    else if (activeTab === 'in_progress') void refetchInProgress();
    else void refetchHistory();
  };

  const headerSubtitle =
    activeTab === 'new'
      ? `${poolData?.total ?? 0} orders in the shared pool`
      : activeTab === 'in_progress'
        ? `${inProgressData?.total ?? 0} orders in your queue`
        : `${historyData?.total ?? 0} completed or closed orders`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpFromLine className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Pay-Out Orders</h1>
            <p className="text-sm text-text-muted">{headerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'history' && (
            <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleRefetch}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-bg-secondary p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'new'
              ? 'bg-bg-primary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <Layers className="h-4 w-4" />
          New
          {(poolData?.total ?? 0) > 0 && (
            <span className="ml-1 rounded-full bg-accent-blue px-2 py-0.5 text-xs text-white">
              {poolData?.total}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('in_progress')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'in_progress'
              ? 'bg-bg-primary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <ListTodo className="h-4 w-4" />
          In progress
          {(inProgressData?.total ?? 0) > 0 && (
            <span className="ml-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
              {inProgressData?.total}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'history'
              ? 'bg-bg-primary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <History className="h-4 w-4" />
          History
          {(historyData?.total ?? 0) > 0 && (
            <span className="ml-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
              {historyData?.total}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'new' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-accent-blue/20 bg-accent-blue/5 p-3">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
            <p className="text-sm text-text-secondary">
              Shared pool of unassigned pay-out orders. Only amounts within your configured limits
              are listed. Taking an order assigns it to you and moves it to In progress.
            </p>
          </div>
          <Table
            columns={poolColumns}
            data={poolData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={poolLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage="No orders in pool matching your limits"
          />
        </Card>
      )}

      {activeTab === 'in_progress' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
            <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <p className="text-sm text-text-secondary">
              Orders you took from New. Start processing, then mark done or failed when the
              transfer is finished.
            </p>
          </div>
          <Table
            columns={ordersColumns}
            data={inProgressData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={inProgressLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage="No orders in your queue — take one from New"
          />
        </Card>
      )}

      {activeTab === 'history' && (
        <>
          {showFilters && (
            <Card className="animate-slide-up">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select
                  label="Status"
                  options={historyStatusOptions}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  placeholder="All statuses"
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setStatusFilter('')}>
                  Clear
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
              <p className="text-sm text-text-secondary">
                Completed payouts and closed orders (failed or upload error).
              </p>
            </div>
            <Table
              columns={ordersColumns}
              data={historyData?.orders ?? []}
              keyExtractor={(row) => row.id}
              loading={historyLoading}
              onRowClick={(row) => setSelectedOrder(row)}
              emptyMessage="No completed pay-out orders yet"
            />
          </Card>
        </>
      )}

      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title="Pay-Out Order Details"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedOrder.id} mono />
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <DetailRow label="Amount" value={formatCurrency(selectedOrder.amount, selectedOrder.currency)} />
              <DetailRow label="Currency" value={selectedOrder.currency} />
              <DetailRow label="Status">
                <Badge variant={payoutStatusVariant[selectedOrder.status]} dot>
                  {selectedOrder.status}
                </Badge>
              </DetailRow>
              <DetailRow label="Rate" value={String(selectedOrder.rate)} />
              <DetailRow label="Partner Amount" value={String(selectedOrder.partner_amount)} />
              <DetailRow label="Fee" value={`${selectedOrder.percent_fee}%`} />
              <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              {selectedOrder.start_at && (
                <DetailRow label="Started" value={formatDateFull(selectedOrder.start_at)} />
              )}
              {selectedOrder.end_at && (
                <DetailRow label="Completed" value={formatDateFull(selectedOrder.end_at)} />
              )}
            </div>

            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Recipient Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Type" value={selectedOrder.details.type} />
                <DetailRow label="Number" value={selectedOrder.details.number} mono />
                <DetailRow label="Owner" value={selectedOrder.details.owner ?? '-'} />
                <DetailRow label="Code" value={selectedOrder.details.code ?? '-'} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {selectedOrder.status === PayOutOrderStatus.PENDING && (
                <Button
                  variant="primary"
                  onClick={() => {
                    takeFromPoolMutation.mutate(selectedOrder.id);
                    setSelectedOrder(null);
                  }}
                  loading={takeFromPoolMutation.isPending}
                >
                  <Play className="h-4 w-4" />
                  Take from Pool
                </Button>
              )}
              {selectedOrder.status === PayOutOrderStatus.NEW && (
                <Button
                  variant="primary"
                  onClick={() => {
                    processMutation.mutate(selectedOrder.id);
                    setSelectedOrder(null);
                  }}
                  loading={processMutation.isPending}
                >
                  <Play className="h-4 w-4" />
                  Start Processing
                </Button>
              )}
              {selectedOrder.status === PayOutOrderStatus.PROCESSING && (
                <>
                  <Button
                    variant="success"
                    onClick={() => completeMutation.mutate(selectedOrder.id)}
                    loading={completeMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Completed
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => failMutation.mutate(selectedOrder.id)}
                    loading={failMutation.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                    Mark Failed
                  </Button>
                </>
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpFromLine,
  RefreshCw,
  Filter,
  Layers,
  ListTodo,
  History,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { usePayoutCabinetRealtime } from '@/lib/payin-realtime';
import { cn } from '@/lib/utils';
import { getToken } from '@/lib/auth';
import { PAYOUT_TRADER_HISTORY_STATUSES } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { buildPayoutOrdersColumns, buildPayoutPoolColumns, type PayoutCompleteVars } from './trader-payout-columns';
import { TraderPayoutOrderDetailModal } from './trader-payout-order-detail-modal';

interface PayOutListResponse {
  orders: PayOutOrderApiDto[];
  total: number;
}

type TabType = 'new' | 'in_progress' | 'history';

export type TraderPayoutPageVariant = 'standard' | 'specialist';

export function TraderPayoutPage({
  variant = 'standard',
  initialTab = 'new',
}: {
  variant?: TraderPayoutPageVariant;
  /** Used by Pay-Out specialist `/payout-trader/history` route (cabinet spec: History section). */
  initialTab?: TabType;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const isSpecialist = variant === 'specialist';
  const apiBase = isSpecialist ? internalPaths.payoutCabinetSpecialist : internalPaths.payoutCabinetTrader;
  const qk = isSpecialist ? 'payout-trader' : 'trader';
  const apiPublicBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  usePayoutCabinetRealtime(queryClient, isSpecialist ? 'specialist' : 'standard');

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const navigateTab = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      if (!isSpecialist) return;
      if (tab === 'history') {
        router.push('/payout-trader/history');
      } else {
        router.push('/payout-trader/payout');
      }
    },
    [isSpecialist, router],
  );

  useEffect(() => {
    if (!isSpecialist || !pathname) return;
    if (pathname.startsWith('/payout-trader/history')) {
      setActiveTab('history');
    }
  }, [isSpecialist, pathname]);

  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PayOutOrderApiDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: inProgressData, isLoading: inProgressLoading, refetch: refetchInProgress } =
    useQuery({
      queryKey: [qk, 'payout-orders', { queue: 'in_progress' }],
      queryFn: () =>
        api.get<PayOutListResponse>(`${apiBase}/orders`, { queue: 'in_progress' }),
    });

  const historyListParams: Record<string, string> = { queue: 'history' };
  if (statusFilter) historyListParams.status = statusFilter;
  if (dateFrom) historyListParams.date_from = dateFrom;
  if (dateTo) historyListParams.date_to = dateTo;
  if (minAmount.trim()) historyListParams.min_amount = minAmount.trim();
  if (maxAmount.trim()) historyListParams.max_amount = maxAmount.trim();

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: [qk, 'payout-orders', historyListParams],
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/orders`, historyListParams),
  });

  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery({
    queryKey: [qk, 'payout-pool'],
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/pool`),
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
    mutationFn: (orderId: string) => api.post(`${apiBase}/orders/${orderId}/take`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
      queryClient.invalidateQueries({ queryKey: [qk, 'payout-orders'] });
    },
  });

  const processMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`${apiBase}/orders/${orderId}/process`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [qk, 'payout-orders'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (payload: PayoutCompleteVars) => {
      const body =
        isSpecialist && payload.completionProofFileId
          ? { completion_proof_file_id: payload.completionProofFileId }
          : isSpecialist
            ? {}
            : undefined;
      return api.post(`${apiBase}/orders/${payload.orderId}/complete`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [qk, 'payout-orders'] });
      setSelectedOrder(null);
    },
  });

  const failMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`${apiBase}/orders/${orderId}/fail`, {
        orderId,
        reason: 'Marked as failed by trader',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [qk, 'payout-orders'] });
      if (isSpecialist) {
        queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
      }
      setSelectedOrder(null);
    },
  });

  const historyStatusOptions = PAYOUT_TRADER_HISTORY_STATUSES.map((s) => ({
    value: s,
    label: s,
  }));

  const poolColumns = buildPayoutPoolColumns({
    variant: isSpecialist ? 'specialist' : 'standard',
    takeFromPoolMutation,
    onView: setSelectedOrder,
  });

  const ordersColumns = buildPayoutOrdersColumns({
    variant: isSpecialist ? 'specialist' : 'standard',
    processMutation,
    completeMutation,
    failMutation,
    onView: setSelectedOrder,
  });

  const handleExportCsv = async () => {
    if (!isSpecialist) return;
    const token = getToken();
    const params = new URLSearchParams();
    params.set('queue', 'history');
    if (statusFilter) params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (minAmount.trim()) params.set('min_amount', minAmount.trim());
    if (maxAmount.trim()) params.set('max_amount', maxAmount.trim());
    const res = await fetch(`${apiPublicBase}${apiBase}/orders/csv?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payout-specialist-orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefetch = () => {
    if (activeTab === 'new') void refetchPool();
    else if (activeTab === 'in_progress') void refetchInProgress();
    else void refetchHistory();
  };

  const headerSubtitle =
    activeTab === 'new'
      ? isSpecialist
        ? `${poolData?.total ?? 0} orders in your geo pool (pool B)`
        : `${poolData?.total ?? 0} orders in the shared pool`
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
          {isSpecialist && activeTab === 'history' && (
            <Button variant="secondary" size="sm" onClick={() => void handleExportCsv()}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          )}
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
          onClick={() => navigateTab('new')}
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
          onClick={() => navigateTab('in_progress')}
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
          onClick={() => navigateTab('history')}
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
              {isSpecialist
                ? 'Pool B: unassigned pay-out orders for your region. Taking an order assigns it to you as PROCESSING (in progress).'
                : 'Shared pool of unassigned pay-out orders. Only amounts within your configured limits are listed. Taking an order assigns it to you and moves it to In progress.'}
            </p>
          </div>
          <Table
            columns={poolColumns}
            data={poolData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={poolLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage={
              isSpecialist
                ? 'No orders in your pool — check back soon'
                : 'No orders in pool matching your limits'
            }
          />
        </Card>
      )}

      {activeTab === 'in_progress' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
            <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <p className="text-sm text-text-secondary">
              Orders you took from New. Start processing, then mark done or failed when the transfer
              is finished.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Select
                  label="Status"
                  options={historyStatusOptions}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  placeholder="All statuses"
                />
                <Input
                  label="Closed from (date)"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <Input
                  label="Closed to (date)"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                <Input
                  label="Min amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="Optional"
                />
                <Input
                  label="Max amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('');
                    setDateFrom('');
                    setDateTo('');
                    setMinAmount('');
                    setMaxAmount('');
                  }}
                >
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

      <TraderPayoutOrderDetailModal
        variant={variant}
        selectedOrder={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        takeFromPoolMutation={takeFromPoolMutation}
        processMutation={processMutation}
        completeMutation={completeMutation}
        failMutation={failMutation}
      />
    </div>
  );
}

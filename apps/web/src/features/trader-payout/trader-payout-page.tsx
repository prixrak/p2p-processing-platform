'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpFromLine,
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
import { normalizeDecimalSeparators } from '@/lib/decimal-input';
import {
  payoutCabinetKeys,
  type PayoutCabinetScope,
} from '@/lib/query-keys';

interface PayOutListResponse {
  orders: PayOutOrderApiDto[];
  total: number;
  page: number;
  limit: number;
}

const PAYOUT_LIST_PAGE_SIZE = 20;

type TabType = 'new' | 'in_progress' | 'history';

export type TraderPayoutPageVariant = 'standard' | 'specialist';

export function TraderPayoutPage({
  variant = 'standard',
  initialTab = 'new',
}: {
  variant?: TraderPayoutPageVariant;
  /** Initial tab; specialist cabinet also syncs `?tab=` on `/payout-trader/payout`. */
  initialTab?: TabType;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSpecialist = variant === 'specialist';
  const apiBase = isSpecialist ? internalPaths.payoutCabinetSpecialist : internalPaths.payoutCabinetTrader;
  const qk: PayoutCabinetScope = isSpecialist ? 'payout-trader' : 'trader';
  const apiPublicBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  usePayoutCabinetRealtime(queryClient, isSpecialist ? 'specialist' : 'standard');

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const navigateTab = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      if (!isSpecialist) return;
      const path = '/payout-trader/payout';
      if (tab === 'new') {
        router.replace(path);
      } else {
        router.replace(`${path}?tab=${tab}`);
      }
    },
    [isSpecialist, router],
  );

  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (!isSpecialist) return;
    if (tabParam === 'history' || tabParam === 'in_progress') {
      setActiveTab(tabParam);
    } else {
      setActiveTab('new');
    }
  }, [isSpecialist, tabParam]);

  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PayOutOrderApiDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [poolPage, setPoolPage] = useState(1);
  const [inProgressPage, setInProgressPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (activeTab === 'new') setPoolPage(1);
    else if (activeTab === 'in_progress') setInProgressPage(1);
    else setHistoryPage(1);
  }, [activeTab]);

  useEffect(() => {
    setHistoryPage(1);
  }, [statusFilter, dateFrom, dateTo, minAmount, maxAmount]);

  const inProgressParams: Record<string, string> = {
    queue: 'in_progress',
    page: String(inProgressPage),
    limit: String(PAYOUT_LIST_PAGE_SIZE),
  };

  const poolParams: Record<string, string> = {
    page: String(poolPage),
    limit: String(PAYOUT_LIST_PAGE_SIZE),
  };

  const { data: inProgressData, isLoading: inProgressLoading } =
    useQuery({
      queryKey: payoutCabinetKeys.payoutOrders(qk, inProgressParams),
      queryFn: () =>
        api.get<PayOutListResponse>(`${apiBase}/orders`, inProgressParams),
    });

  const historyListParams: Record<string, string> = {
    queue: 'history',
    page: String(historyPage),
    limit: String(PAYOUT_LIST_PAGE_SIZE),
  };
  if (statusFilter) historyListParams.status = statusFilter;
  if (dateFrom) historyListParams.date_from = dateFrom;
  if (dateTo) historyListParams.date_to = dateTo;
  if (minAmount.trim()) historyListParams.min_amount = normalizeDecimalSeparators(minAmount.trim());
  if (maxAmount.trim()) historyListParams.max_amount = normalizeDecimalSeparators(maxAmount.trim());

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: payoutCabinetKeys.payoutOrders(qk, historyListParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/orders`, historyListParams),
  });

  const { data: poolData, isLoading: poolLoading } = useQuery({
    queryKey: payoutCabinetKeys.payoutPool(qk, poolParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/pool`, poolParams),
  });

  const poolLimit = poolData?.limit ?? PAYOUT_LIST_PAGE_SIZE;
  const poolTotalPages = Math.max(1, Math.ceil((poolData?.total ?? 0) / poolLimit));
  const inProgressLimit = inProgressData?.limit ?? PAYOUT_LIST_PAGE_SIZE;
  const inProgressTotalPages = Math.max(
    1,
    Math.ceil((inProgressData?.total ?? 0) / inProgressLimit),
  );
  const historyLimit = historyData?.limit ?? PAYOUT_LIST_PAGE_SIZE;
  const historyTotalPages = Math.max(1, Math.ceil((historyData?.total ?? 0) / historyLimit));

  useEffect(() => {
    if (poolPage > poolTotalPages) setPoolPage(poolTotalPages);
  }, [poolPage, poolTotalPages]);

  useEffect(() => {
    if (inProgressPage > inProgressTotalPages) setInProgressPage(inProgressTotalPages);
  }, [inProgressPage, inProgressTotalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

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
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
    },
  });

  const processMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`${apiBase}/orders/${orderId}/process`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
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
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
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
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpFromLine className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Pay-Out Orders</h1>
            <p className="text-sm text-text-muted">{headerSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
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
          {isSpecialist && activeTab === 'history' && (
            <Button variant="secondary" size="sm" onClick={() => void handleExportCsv()}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <Card>
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
              type="text"
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Optional"
            />
            <Input
              label="Max amount"
              type="text"
              inputMode="decimal"
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
          {poolTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
              <span>
                Page {poolPage} of {poolTotalPages} ({poolData?.total ?? 0} orders)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() => setPoolPage((p) => Math.max(1, p - 1))}
                  disabled={poolPage <= 1}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() =>
                    setPoolPage((p) => Math.min(poolTotalPages, p + 1))
                  }
                  disabled={poolPage >= poolTotalPages}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
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
          {inProgressTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
              <span>
                Page {inProgressPage} of {inProgressTotalPages} ({inProgressData?.total ?? 0}{' '}
                orders)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() =>
                    setInProgressPage((p) => Math.max(1, p - 1))
                  }
                  disabled={inProgressPage <= 1}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() =>
                    setInProgressPage((p) =>
                      Math.min(inProgressTotalPages, p + 1),
                    )
                  }
                  disabled={inProgressPage >= inProgressTotalPages}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'history' && (
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
          {historyTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
              <span>
                Page {historyPage} of {historyTotalPages} ({historyData?.total ?? 0} orders)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() =>
                    setHistoryPage((p) => Math.max(1, p - 1))
                  }
                  disabled={historyPage <= 1}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="rounded bg-bg-secondary px-3 py-1 disabled:opacity-40"
                  onClick={() =>
                    setHistoryPage((p) =>
                      Math.min(historyTotalPages, p + 1),
                    )
                  }
                  disabled={historyPage >= historyTotalPages}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Card>
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

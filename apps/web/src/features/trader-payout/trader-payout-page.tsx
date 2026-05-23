'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { FilterInput } from '@/components/ui/filters';
import { DEFAULT_LIST_PAGE_SIZE, type ListPageSize } from '@/lib/list-pagination';
import { listSearchForQuery } from '@/lib/list-search';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import { ListPageRefreshButton } from '@/components/ui/list-page-tools';
import { Card } from '@/components/ui/card';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { cn } from '@/lib/utils';
import { getToken } from '@/lib/auth';
import { PAYOUT_TRADER_HISTORY_STATUSES, PayoutTraderRejectReason } from '@p2p/shared';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
import { buildPayoutOrdersColumns, buildPayoutPoolColumns, type PayoutCompleteVars } from './trader-payout-columns';
import type { PayoutRejectVars } from './trader-payout-workflow-actions';
import { TraderPayoutOrderDetailModal } from './trader-payout-order-detail-modal';
import { normalizeDecimalSeparators } from '@/lib/decimal-input';
import {
  payoutCabinetKeys,
  type PayoutCabinetScope,
} from '@/lib/query-keys';

interface PayOutListResponse {
  orders: PayOutOrderCabinetDto[];
  total: number;
  page: number;
  limit: number;
}

const PAYOUT_LIST_PAGE_SIZE = DEFAULT_LIST_PAGE_SIZE;

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
  const t = useTranslations('Trader.Payout');
  const tCommon = useTranslations('Trader.Common');

  const [pageSize, setPageSize] = useState<ListPageSize>(PAYOUT_LIST_PAGE_SIZE);

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
  const {
    value: minAmount,
    setValue: setMinAmount,
    debounced: debouncedMinAmount,
  } = useDebouncedTextFilter();
  const {
    value: maxAmount,
    setValue: setMaxAmount,
    debounced: debouncedMaxAmount,
  } = useDebouncedTextFilter();
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();
  const [selectedOrder, setSelectedOrder] = useState<PayOutOrderCabinetDto | null>(null);
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
  }, [statusFilter, dateFrom, dateTo, debouncedMinAmount, debouncedMaxAmount]);

  const searchParam = listSearchForQuery(debouncedSearch);

  useEffect(() => {
    setPoolPage(1);
    setInProgressPage(1);
    setHistoryPage(1);
  }, [searchParam, pageSize]);

  const inProgressParams: Record<string, string> = {
    queue: 'in_progress',
    page: String(inProgressPage),
    limit: String(pageSize),
    ...(searchParam ? { search: searchParam } : {}),
  };

  const poolParams: Record<string, string> = {
    page: String(poolPage),
    limit: String(pageSize),
    ...(searchParam ? { search: searchParam } : {}),
  };

  /** Fetch inactive tabs only while an order detail modal is open (keeps row data in sync after actions). */
  const prefetchForOpenModal = !!selectedOrder;

  const inProgressListActive = activeTab === 'in_progress' || prefetchForOpenModal;
  const historyListActive = activeTab === 'history' || prefetchForOpenModal;
  const poolListActive = activeTab === 'new' || prefetchForOpenModal;

  const inProgressBadgeParams = useMemo(
    (): Record<string, string> => ({
      queue: 'in_progress',
      page: '1',
      limit: '1',
    }),
    [],
  );

  const historyBadgeParams = useMemo((): Record<string, string> => {
    const params: Record<string, string> = {
      queue: 'history',
      page: '1',
      limit: '1',
    };
    if (statusFilter) params.status = statusFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (debouncedMinAmount) {
      params.min_amount = normalizeDecimalSeparators(debouncedMinAmount);
    }
    if (debouncedMaxAmount) {
      params.max_amount = normalizeDecimalSeparators(debouncedMaxAmount);
    }
    return params;
  }, [statusFilter, dateFrom, dateTo, debouncedMinAmount, debouncedMaxAmount]);

  const poolBadgeParams = useMemo(
    (): Record<string, string> => ({
      page: '1',
      limit: '1',
    }),
    [],
  );

  const { data: inProgressBadge } = useQuery({
    queryKey: payoutCabinetKeys.payoutOrders(qk, inProgressBadgeParams),
    queryFn: () =>
      api.get<PayOutListResponse>(`${apiBase}/orders`, inProgressBadgeParams),
    enabled: !inProgressListActive && !searchParam,
    staleTime: 10_000,
  });

  const { data: historyBadge } = useQuery({
    queryKey: payoutCabinetKeys.payoutOrders(qk, historyBadgeParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/orders`, historyBadgeParams),
    enabled: !historyListActive && !searchParam,
    staleTime: 10_000,
  });

  const { data: poolBadge } = useQuery({
    queryKey: payoutCabinetKeys.payoutPool(qk, poolBadgeParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/pool`, poolBadgeParams),
    enabled: !poolListActive && !searchParam,
    staleTime: 10_000,
  });

  const { data: inProgressData, isLoading: inProgressLoading } =
    useQuery({
      queryKey: payoutCabinetKeys.payoutOrders(qk, inProgressParams),
      queryFn: () =>
        api.get<PayOutListResponse>(`${apiBase}/orders`, inProgressParams),
      enabled: inProgressListActive,
    });

  const historyListParams: Record<string, string> = {
    queue: 'history',
    page: String(historyPage),
    limit: String(pageSize),
  };
  if (statusFilter) historyListParams.status = statusFilter;
  if (dateFrom) historyListParams.date_from = dateFrom;
  if (dateTo) historyListParams.date_to = dateTo;
  if (debouncedMinAmount) {
    historyListParams.min_amount = normalizeDecimalSeparators(debouncedMinAmount);
  }
  if (debouncedMaxAmount) {
    historyListParams.max_amount = normalizeDecimalSeparators(debouncedMaxAmount);
  }
  if (searchParam) historyListParams.search = searchParam;

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: payoutCabinetKeys.payoutOrders(qk, historyListParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/orders`, historyListParams),
    enabled: historyListActive,
  });

  const { data: poolData, isLoading: poolLoading } = useQuery({
    queryKey: payoutCabinetKeys.payoutPool(qk, poolParams),
    queryFn: () => api.get<PayOutListResponse>(`${apiBase}/pool`, poolParams),
    enabled: poolListActive,
  });

  const poolTotal = poolListActive ? (poolData?.total ?? 0) : (poolBadge?.total ?? 0);
  const inProgressTotal = inProgressListActive
    ? (inProgressData?.total ?? 0)
    : (inProgressBadge?.total ?? 0);
  const historyTotal = historyListActive
    ? (historyData?.total ?? 0)
    : (historyBadge?.total ?? 0);

  const poolLimit = poolData?.limit ?? pageSize;
  const poolTotalPages = Math.max(1, Math.ceil((poolData?.total ?? 0) / poolLimit));
  const inProgressLimit = inProgressData?.limit ?? pageSize;
  const inProgressTotalPages = Math.max(
    1,
    Math.ceil((inProgressData?.total ?? 0) / inProgressLimit),
  );
  const historyLimit = historyData?.limit ?? pageSize;
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
    if (!fresh) return;
    setSelectedOrder((prev) => (prev?.id === fresh.id ? fresh : prev));
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
    mutationFn: async (payload: PayoutCompleteVars) =>
      api.post(`${apiBase}/orders/${payload.orderId}/complete`, {
        ...(payload.completionProofFileIds != null && payload.completionProofFileIds.length > 0
          ? { completion_proof_file_ids: payload.completionProofFileIds }
          : payload.completionProofFileId != null
            ? { completion_proof_file_id: payload.completionProofFileId }
            : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
      setSelectedOrder(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`${apiBase}/orders/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
      if (isSpecialist) {
        queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
      }
      setSelectedOrder(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason, reason_other_note }: PayoutRejectVars) =>
      api.post(`${apiBase}/orders/${orderId}/fail`, {
        reason,
        ...(reason === PayoutTraderRejectReason.OTHER &&
        reason_other_note != null &&
        reason_other_note !== ''
          ? { reason_other_note }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
      if (isSpecialist) {
        queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
      }
      setSelectedOrder(null);
    },
  });

  const attachCompletionProofMutation = useMutation({
    mutationFn: async ({ orderId, fileIds }: { orderId: string; fileIds: string[] }) =>
      api.post<PayOutOrderCabinetDto>(`${apiBase}/orders/${orderId}/completion-proof`, {
        completion_proof_file_ids: fileIds,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
      setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  const detachCompletionProofMutation = useMutation({
    mutationFn: async ({ orderId, fileId }: { orderId: string; fileId: string }) =>
      api.delete<PayOutOrderCabinetDto>(
        `${apiBase}/orders/${orderId}/completion-proof/${fileId}`,
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
      setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  const historyStatusOptions = useMemo(
    () =>
      PAYOUT_TRADER_HISTORY_STATUSES.map((s) => ({
        value: s,
        label: t(`statuses.${s}`),
      })),
    [t],
  );

  const statusHistoryPath = useMemo(
    () =>
      isSpecialist
        ? internalPaths.payoutSpecialistOrderStatusHistory
        : internalPaths.traderPayoutOrderStatusHistory,
    [isSpecialist],
  );

  const poolColumns = useMemo(
    () =>
      buildPayoutPoolColumns({
        variant: isSpecialist ? 'specialist' : 'standard',
        takeFromPoolMutation,
        statusHistoryPath,
        t,
      }),
    [isSpecialist, takeFromPoolMutation, statusHistoryPath, t],
  );

  const ordersColumns = useMemo(
    () =>
      buildPayoutOrdersColumns({
        variant: isSpecialist ? 'specialist' : 'standard',
        statusHistoryPath,
        processMutation,
        completeMutation,
        cancelMutation,
        rejectMutation,
        attachCompletionProofMutation,
        detachCompletionProofMutation,
        onView: setSelectedOrder,
        t,
      }),
    [
      isSpecialist,
      statusHistoryPath,
      processMutation,
      completeMutation,
      cancelMutation,
      rejectMutation,
      attachCompletionProofMutation,
      detachCompletionProofMutation,
      t,
    ],
  );

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

  const headerSubtitle = useMemo(() => {
    if (activeTab === 'new') {
      return isSpecialist
        ? t('subtitleGeoPool', { count: poolTotal })
        : t('subtitleSharedPool', { count: poolTotal });
    }
    if (activeTab === 'in_progress') {
      return t('subtitleInProgress', { count: inProgressTotal });
    }
    return t('subtitleHistory', { count: historyTotal });
  }, [activeTab, historyTotal, inProgressTotal, isSpecialist, poolTotal, t]);

  const payoutRefreshing =
    queryClient.isFetching({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) }) > 0 ||
    queryClient.isFetching({ queryKey: [qk, 'payout-pool'] }) > 0;

  const refreshPayout = () => {
    void queryClient.invalidateQueries({ queryKey: payoutCabinetKeys.payoutOrdersScope(qk) });
    void queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpFromLine className="h-6 w-6 text-accent-blue" />
          <div>
            <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{t('title')}</h1>
            <p className="text-sm text-text-muted">{headerSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <ListPageRefreshButton isRefreshing={payoutRefreshing} onRefresh={refreshPayout} />
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            {t('filters')}
          </Button>
          <div className="flex w-full max-w-full gap-1 overflow-x-auto rounded-lg bg-bg-secondary p-1 sm:w-fit sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={() => navigateTab('new')}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
                activeTab === 'new'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              <Layers className="h-4 w-4" />
              {t('tabNew')}
              {poolTotal > 0 && (
                <span className="ml-1 rounded-full bg-accent-blue px-2 py-0.5 text-xs text-white">
                  {poolTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigateTab('in_progress')}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
                activeTab === 'in_progress'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              <ListTodo className="h-4 w-4" />
              {t('tabInProgress')}
              {inProgressTotal > 0 && (
                <span className="ml-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
                  {inProgressTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigateTab('history')}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
                activeTab === 'history'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              <History className="h-4 w-4" />
              {t('tabHistory')}
              {historyTotal > 0 && (
                <span className="ml-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
                  {historyTotal}
                </span>
              )}
            </button>
          </div>
          {isSpecialist && activeTab === 'history' && (
            <Button variant="secondary" size="sm" onClick={() => void handleExportCsv()}>
              <Download className="h-4 w-4" />
              {t('exportCsv')}
            </Button>
          )}
        </div>
      </div>

      <FilterInput
        label={t('searchLabel')}
        value={searchInput}
        onChange={setSearchInput}
        placeholder={t('searchPlaceholder')}
        className="max-w-2xl"
      />

      {showFilters && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label={t('filterStatus')}
              options={historyStatusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder={t('filterAllStatuses')}
            />
            <Input
              label={t('filterClosedFrom')}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              label={t('filterClosedTo')}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <Input
              label={t('filterMinAmount')}
              type="text"
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder={t('filterPlaceholderOptional')}
            />
            <Input
              label={t('filterMaxAmount')}
              type="text"
              inputMode="decimal"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder={t('filterPlaceholderOptional')}
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
              {t('filterClear')}
            </Button>
          </div>
        </Card>
      )}

      {activeTab === 'new' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-accent-blue/20 bg-accent-blue/5 p-3">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
            <p className="text-sm text-text-secondary">
              {isSpecialist ? t('poolBannerSpecialist') : t('poolBannerStandard')}
            </p>
          </div>
          <Table
            columns={poolColumns}
            data={poolData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={poolLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage={
              isSpecialist ? t('emptyPoolSpecialist') : t('emptyPoolStandard')
            }
          />
          <PaginationControls
            page={poolPage}
            totalPages={poolTotalPages}
            onPageChange={setPoolPage}
            totalItems={poolData?.total ?? 0}
            itemLabel={t('itemLabel')}
            variant="minimal"
            className="mt-4"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            rowsPerPageLabel={tCommon('rowsPerPage')}
          />
        </Card>
      )}

      {activeTab === 'in_progress' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
            <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <p className="text-sm text-text-secondary">{t('inProgressBanner')}</p>
          </div>
          <Table
            columns={ordersColumns}
            data={inProgressData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={inProgressLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage={t('emptyInProgress')}
          />
          <PaginationControls
            page={inProgressPage}
            totalPages={inProgressTotalPages}
            onPageChange={setInProgressPage}
            totalItems={inProgressData?.total ?? 0}
            itemLabel={t('itemLabel')}
            variant="minimal"
            className="mt-4"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            rowsPerPageLabel={tCommon('rowsPerPage')}
          />
        </Card>
      )}

      {activeTab === 'history' && (
        <Card>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <p className="text-sm text-text-secondary">{t('historyBanner')}</p>
          </div>
          <Table
            columns={ordersColumns}
            data={historyData?.orders ?? []}
            keyExtractor={(row) => row.id}
            loading={historyLoading}
            onRowClick={(row) => setSelectedOrder(row)}
            emptyMessage={t('emptyHistory')}
          />
          <PaginationControls
            page={historyPage}
            totalPages={historyTotalPages}
            onPageChange={setHistoryPage}
            totalItems={historyData?.total ?? 0}
            itemLabel={t('itemLabel')}
            variant="minimal"
            className="mt-4"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            rowsPerPageLabel={tCommon('rowsPerPage')}
          />
        </Card>
      )}

      <TraderPayoutOrderDetailModal
        selectedOrder={selectedOrder}
        variant={variant}
        onClose={() => setSelectedOrder(null)}
        takeFromPoolMutation={takeFromPoolMutation}
        processMutation={processMutation}
        completeMutation={completeMutation}
        cancelMutation={cancelMutation}
        rejectMutation={rejectMutation}
        attachCompletionProofMutation={attachCompletionProofMutation}
        detachCompletionProofMutation={detachCompletionProofMutation}
      />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowDownToLine } from 'lucide-react';
import type { AppealDto, TraderPayInOrderDto } from '@p2p/shared';
import { ListPageHeader, ListPageRefreshButton, SearchStatusRow } from '@/components/ui/list-page-tools';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs } from '@/components/ui/tabs';
import { Table } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatErrorMessage } from '@/lib/format-error';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import {
  PayInOrderStatus,
  AppealStatus,
  PAYIN_TRADER_CURRENT_STATUSES,
  PAYIN_TRADER_HISTORY_STATUSES,
} from '@p2p/shared';
import { PayInFinalizeConfirmationModal } from './payin-finalize-confirmation-modal';
import type { FinalizeKind, FinalizeDialogState, PayInListApiResponse } from './payin-types';
import { parsePositiveAmount } from './payin-finalize-utils';
import { PayinRequisiteTableCell } from '@/components/ui/payin-requisite-table-cell';
import {
  CopyOrderIdCell,
  CountdownTimer,
  PayInOrderStatusColumnCell,
} from './payin-order-cells';
import {
  OrderFinalizeDropdown,
  OrderFinalizeMenuPortal,
  type OrderFinalizeMenuState,
} from './order-finalize-dropdown';
import {
  PayInAppealDecisionDropdown,
  PayInAppealDecisionMenuPortal,
  type AppealDecisionMenuState,
} from './payin-appeal-decision-dropdown';
import {
  PayInProofViewerModal,
  PayInReceiptGalleryModal,
} from './payin-receipt-modals';
import { PayInOrderDetailModal } from './payin-order-detail-modal';
import { AppealDecisionConfirmDialog } from '@/components/appeals/appeal-decision-confirm-dialog';
import type { PendingAppealDecision } from '@/lib/appeal-decision-confirm';
import { usePaginatedListState } from '@/lib/hooks/use-paginated-list-state';
import { useSelectedRowSync } from '@/lib/hooks/use-selected-row-sync';
import { listSearchForQuery } from '@/lib/list-search';

export function TraderPayInPage() {
  const t = useTranslations('Trader.Payin');
  const tCommon = useTranslations('Trader.Common');
  const queryClient = useQueryClient();
  const [listTab, setListTab] = useState<'current' | 'history'>('current');
  const {
    page,
    setPage,
    searchInput,
    setSearchInput,
    debouncedSearch,
    statusFilter,
    setStatusFilter,
    pageSize,
    setPageSize,
    useClampToTotalPages,
  } = usePaginatedListState({
    resetWhen: [listTab],
  });
  const [selectedOrder, setSelectedOrder] = useState<TraderPayInOrderDto | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<TraderPayInOrderDto | null>(null);
  const [viewingProofFileId, setViewingProofFileId] = useState<string | null>(null);
  const [finalizeMenu, setFinalizeMenu] = useState<OrderFinalizeMenuState>(null);
  const [appealDecisionMenu, setAppealDecisionMenu] = useState<AppealDecisionMenuState>(null);
  const [pendingAppealDecision, setPendingAppealDecision] =
    useState<PendingAppealDecision | null>(null);

  const appealConfirmLabels = useMemo(
    () => ({
      title: t('appealDecision.confirmTitle'),
      rejectDescription: t('appealDecision.confirmRejectDescription'),
      acceptDescription: t('appealDecision.confirmAcceptDescription'),
      rejectLabel: t('appealDecision.confirmRejectLabel'),
      acceptLabel: t('appealDecision.confirmAcceptLabel'),
      cancelLabel: t('appealDecision.confirmCancel'),
    }),
    [t],
  );

  const appealAmountLabels = useMemo(
    () => ({
      label: t('appealDecision.amountLabel'),
      hint: t('appealDecision.amountHint'),
    }),
    [t],
  );

  const requestAppealDecision = useCallback(
    (appealId: string, decision: AppealStatus, order: TraderPayInOrderDto) => {
      setPendingAppealDecision({
        appealId,
        decision,
        orderAmount: Number(order.amount),
      });
    },
    [],
  );
  const [finalizeDialog, setFinalizeDialog] = useState<FinalizeDialogState | null>(null);

  const statusLabels = useMemo(
    () => ({
      [PayInOrderStatus.PENDING]: t('statuses.PENDING'),
      [PayInOrderStatus.NEW]: t('statuses.NEW'),
      [PayInOrderStatus.VERIFIED]: t('statuses.VERIFIED'),
      [PayInOrderStatus.PAID]: t('statuses.PAID'),
      [PayInOrderStatus.UNDERPAID]: t('statuses.UNDERPAID'),
      [PayInOrderStatus.OVERPAID]: t('statuses.OVERPAID'),
      [PayInOrderStatus.APPEAL]: t('statuses.APPEAL'),
      [PayInOrderStatus.CANCELED]: t('statuses.CANCELED'),
      [PayInOrderStatus.UPLOAD_FAILED]: t('statuses.UPLOAD_FAILED'),
      [PayInOrderStatus.NO_REQUISITE]: t('statuses.NO_REQUISITE'),
    }),
    [t],
  );

  useEffect(() => {
    if (!finalizeMenu && !appealDecisionMenu) return;
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (finalizeMenu && !el?.closest('[data-trader-payin-finalize-dropdown]')) {
        setFinalizeMenu(null);
      }
      if (appealDecisionMenu && !el?.closest('[data-payin-appeal-decision-dropdown]')) {
        setAppealDecisionMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [finalizeMenu, appealDecisionMenu]);

  const queryParams: Record<string, string> = {
    list: listTab,
    page: String(page),
    limit: String(pageSize),
  };
  if (statusFilter) queryParams.status = statusFilter;
  const searchParam = listSearchForQuery(debouncedSearch);
  if (searchParam) queryParams.search = searchParam;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: traderKeys.payinOrders(queryParams),
    queryFn: async () => {
      const { data: res, clockOffsetMs } = await api.getWithClockOffset<PayInListApiResponse>(
        internalPaths.traderPayinOrders,
        queryParams,
      );
      const limit = res.limit ?? pageSize;
      const totalPages = Math.max(1, Math.ceil(res.total / limit));
      return {
        orders: res.items,
        total: res.total,
        page: res.page,
        limit,
        totalPages,
        clockOffsetMs,
      };
    },
  });

  useClampToTotalPages(data?.totalPages);
  useSelectedRowSync(data?.orders, selectedOrder, setSelectedOrder);
  useSelectedRowSync(data?.orders, receiptOrder, setReceiptOrder);

  const finalizeMenuOrder = useMemo(() => {
    if (!finalizeMenu) return null;
    const fromList = data?.orders.find((order) => order.id === finalizeMenu.orderId);
    if (fromList) return fromList;
    if (selectedOrder?.id === finalizeMenu.orderId) return selectedOrder;
    return null;
  }, [data?.orders, finalizeMenu, selectedOrder]);

  const appealDecisionMenuOrder = useMemo(() => {
    if (!appealDecisionMenu) return null;
    const fromList = data?.orders.find((order) => order.id === appealDecisionMenu.orderId);
    if (fromList) return fromList;
    if (selectedOrder?.id === appealDecisionMenu.orderId) return selectedOrder;
    return null;
  }, [appealDecisionMenu, data?.orders, selectedOrder]);

  function openFinalize(kind: FinalizeKind, order: TraderPayInOrderDto) {
    setFinalizeDialog({
      order,
      kind,
      adjustmentInput: '',
    });
  }

  const confirmMutation = useMutation({
    mutationFn: (vars: { orderId: string; actualAmount?: number }) =>
      api.post(internalPaths.traderPayinOrderConfirm(vars.orderId), {
        orderId: vars.orderId,
        ...(vars.actualAmount !== undefined ? { actualAmount: vars.actualAmount } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      setSelectedOrder(null);
      setFinalizeDialog(null);
    },
    onError: (e: unknown) => {
      toast.error(formatErrorMessage(e));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => api.post(internalPaths.traderPayinOrderCancel(orderId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      setSelectedOrder(null);
      setFinalizeDialog(null);
    },
    onError: (e: unknown) => {
      toast.error(formatErrorMessage(e));
    },
  });

  const resolveAppealMutation = useMutation({
    mutationFn: ({
      appealId,
      decision,
      actualAmount,
    }: {
      appealId: string;
      decision: AppealStatus;
      actualAmount?: number;
    }) =>
      api.patch<AppealDto>(internalPaths.appealResolve(appealId), {
        decision,
        ...(actualAmount !== undefined ? { actualAmount } : {}),
      }),
    onSuccess: () => {
      setPendingAppealDecision(null);
      void queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      void queryClient.invalidateQueries({ queryKey: traderKeys.appealsScope });
      toast.success(t('appealSaved'));
    },
    onError: (e: unknown) => {
      toast.error(formatErrorMessage(e));
    },
  });

  function commitFinalize() {
    if (!finalizeDialog) return;
    const { order, kind, adjustmentInput } = finalizeDialog;
    if (kind === 'cancel') {
      cancelMutation.mutate(order.id);
      return;
    }
    if (kind === 'paid') {
      confirmMutation.mutate({ orderId: order.id });
      return;
    }
    const actual = parsePositiveAmount(adjustmentInput);
    if (actual === null) {
      toast.error(t('toastInvalidAmount'));
      return;
    }
    const orderAmt = Number(order.amount);
    if (actual === orderAmt) {
      toast.error(t('toastAmountMatches'));
      return;
    }
    confirmMutation.mutate({ orderId: order.id, actualAmount: actual });
  }

  const allowedStatusesForTab =
    listTab === 'current' ? PAYIN_TRADER_CURRENT_STATUSES : PAYIN_TRADER_HISTORY_STATUSES;
  const statusOptions = allowedStatusesForTab.map((s) => ({
    value: s,
    label: statusLabels[s as PayInOrderStatus] ?? s,
  }));
  const statusSelectOptions = [{ value: '', label: t('allStatuses') }, ...statusOptions];

  const clockOffsetMs = data?.clockOffsetMs ?? 0;

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: t('colOrderId'),
        className: 'min-w-[8rem]',
        mobilePrimary: true,
        render: (row: TraderPayInOrderDto) => <CopyOrderIdCell id={row.id} />,
      },
      {
        key: 'created_at',
        header: t('colCreated'),
        render: (row: TraderPayInOrderDto) => (
          <span className="whitespace-nowrap text-sm text-text-muted">
            {formatDateFull(row.created_at)}
          </span>
        ),
      },
      listTab === 'history'
        ? {
            key: 'completed_at',
            header: t('colCompletionTime'),
            render: (row: TraderPayInOrderDto) => (
              <span className="whitespace-nowrap text-sm text-text-muted">
                {row.completed_at != null ? formatDateFull(row.completed_at) : t('dash')}
              </span>
            ),
          }
        : {
            key: 'timer',
            header: t('colTimeToComplete'),
            className: 'text-end font-mono tabular-nums',
            render: (row: TraderPayInOrderDto) => (
              <CountdownTimer
                autocloseAt={row.autoclose_at}
                createdAt={row.created_at}
                status={row.status}
                clockOffsetMs={clockOffsetMs}
              />
            ),
          },
      {
        key: 'amount',
        header: t('colPaymentAmount'),
        className: 'text-end tabular-nums align-top',
        mobilePrimary: true,
        render: (row: TraderPayInOrderDto) => (
          <div className="flex flex-col items-end gap-0.5 leading-tight">
            <span className="font-semibold text-text-primary">
              {formatCurrency(row.amount, row.currency)}
            </span>
            {row.amount_equivalent_usdt != null ? (
              <span
                className="text-xs font-normal tabular-nums text-text-muted"
                title={t('usdtEquivTitle')}
              >
                {row.amount_equivalent_usdt.toFixed(2)} USDT
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'requisite',
        header: t('colRequisite'),
        className: 'min-w-[7rem]',
        render: (row: TraderPayInOrderDto) => <PayinRequisiteTableCell row={row} />,
      },
      {
        key: 'status',
        header: t('colStatus'),
        className: 'text-center align-top',
        mobilePrimary: true,
        render: (row: TraderPayInOrderDto) => (
          <PayInOrderStatusColumnCell row={row} onOpenReceipts={setReceiptOrder} />
        ),
      },
      ...(listTab !== 'history'
        ? [
            {
              key: 'actions',
              header: t('colActions'),
              className: 'text-end',
              render: (row: TraderPayInOrderDto) => {
                const openAppeal = (row.appeals ?? []).find((a) => a.status === AppealStatus.OPEN);
                const showAppealActions =
                  row.status === PayInOrderStatus.APPEAL && openAppeal !== undefined;
                const appealBusy =
                  resolveAppealMutation.isPending &&
                  resolveAppealMutation.variables?.appealId === openAppeal?.id;

                return (
                  <div
                    className="flex flex-wrap items-center justify-end gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {showAppealActions && (
                      <PayInAppealDecisionDropdown
                        orderId={row.id}
                        appealId={openAppeal!.id}
                        menuState={appealDecisionMenu}
                        setMenuState={setAppealDecisionMenu}
                        menuAnchor="table"
                        loading={appealBusy}
                      />
                    )}
                    <OrderFinalizeDropdown
                      order={row}
                      menuState={finalizeMenu}
                      setMenuState={setFinalizeMenu}
                      menuAnchor="table"
                    />
                  </div>
                );
              },
            },
          ]
        : []),
    ],
    [
      t,
      listTab,
      clockOffsetMs,
      resolveAppealMutation.isPending,
      resolveAppealMutation.variables?.appealId,
      appealDecisionMenu,
      finalizeMenu,
      requestAppealDecision,
    ],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={
          <div className="flex items-center gap-3">
            <ArrowDownToLine className="h-6 w-6 text-accent-green" />
            <div>
              <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{t('title')}</h1>
              <p className="text-sm text-text-muted">
                {listTab === 'current' ? t('subtitleCurrent') : t('subtitleHistory')}{' '}
                <span className="text-text-secondary">{t('inView', { count: data?.total ?? 0 })}</span>
              </p>
            </div>
          </div>
        }
        actions={
          <>
            <ListPageRefreshButton
              isRefreshing={isFetching}
              onRefresh={() =>
                queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope })
              }
            />
            <Tabs
            tabs={[
              { key: 'current', label: t('tabCurrent') },
              { key: 'history', label: t('tabHistory') },
            ]}
            active={listTab}
            onChange={(k) => {
              const next = k as 'current' | 'history';
              setPage(1);
              setListTab(next);
              const allowed =
                next === 'current' ? PAYIN_TRADER_CURRENT_STATUSES : PAYIN_TRADER_HISTORY_STATUSES;
              setStatusFilter((prev) =>
                prev && allowed.includes(prev as PayInOrderStatus) ? prev : '',
              );
            }}
          />
          </>
        }
      />

      <SearchStatusRow
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={t('searchPlaceholder')}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={statusSelectOptions}
      />

      <Table
        columns={columns}
        data={data?.orders ?? []}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => {
          setFinalizeMenu(null);
          setAppealDecisionMenu(null);
          setSelectedOrder(row);
        }}
        emptyMessage={t('emptyMessage')}
      />

      <PaginationControls
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        totalItems={data?.total ?? 0}
        itemLabel={t('itemLabel')}
        variant="minimal"
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        rowsPerPageLabel={tCommon('rowsPerPage')}
      />

      <PayInReceiptGalleryModal
        receiptOrder={receiptOrder}
        onClose={() => {
          setReceiptOrder(null);
          setViewingProofFileId(null);
        }}
        onOpenProof={(fileId) => setViewingProofFileId(fileId)}
      />

      <PayInProofViewerModal fileId={viewingProofFileId} onClose={() => setViewingProofFileId(null)} />

      <OrderFinalizeMenuPortal
        menuState={finalizeMenu}
        setMenuState={setFinalizeMenu}
        order={finalizeMenuOrder}
        onPickKind={(kind) => {
          const order = finalizeMenuOrder;
          if (order) openFinalize(kind, order);
        }}
      />

      <PayInAppealDecisionMenuPortal
        menuState={appealDecisionMenu}
        setMenuState={setAppealDecisionMenu}
        loading={
          resolveAppealMutation.isPending &&
          resolveAppealMutation.variables?.appealId === appealDecisionMenu?.appealId
        }
        onReject={() => {
          const order = appealDecisionMenuOrder;
          const appealId = appealDecisionMenu?.appealId;
          if (order && appealId) {
            requestAppealDecision(appealId, AppealStatus.REJECTED, order);
          }
        }}
        onAccept={() => {
          const order = appealDecisionMenuOrder;
          const appealId = appealDecisionMenu?.appealId;
          if (order && appealId) {
            requestAppealDecision(appealId, AppealStatus.RESOLVED, order);
          }
        }}
      />

      <PayInOrderDetailModal
        selectedOrder={selectedOrder}
        historyMode={listTab === 'history'}
        clockOffsetMs={data?.clockOffsetMs ?? 0}
        appealDecisionMenu={appealDecisionMenu}
        setAppealDecisionMenu={setAppealDecisionMenu}
        resolveAppealMutation={resolveAppealMutation}
        onOpenReceipts={setReceiptOrder}
        onClose={() => {
          setFinalizeMenu((m) => (m?.anchor === 'modal' ? null : m));
          setAppealDecisionMenu((m) => (m?.anchor === 'modal' ? null : m));
          setSelectedOrder(null);
        }}
        finalizeMenu={finalizeMenu}
        setFinalizeMenu={setFinalizeMenu}
      />

      <PayInFinalizeConfirmationModal
        finalizeDialog={finalizeDialog}
        onClose={() => setFinalizeDialog(null)}
        setFinalizeDialog={setFinalizeDialog}
        onApply={() => commitFinalize()}
        confirmMutation={confirmMutation}
        cancelMutation={cancelMutation}
      />

      <AppealDecisionConfirmDialog
        pending={pendingAppealDecision}
        onOpenChange={(open) => !open && setPendingAppealDecision(null)}
        labels={appealConfirmLabels}
        amountLabels={appealAmountLabels}
        loading={resolveAppealMutation.isPending}
        onConfirm={({ appealId, decision, actualAmount }) =>
          resolveAppealMutation.mutate({ appealId, decision, actualAmount })
        }
      />
    </div>
  );
}

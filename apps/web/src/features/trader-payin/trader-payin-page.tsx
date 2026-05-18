'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine } from 'lucide-react';
import type { AppealDto, TraderPayInOrderDto } from '@p2p/shared';
import { ListPageHeader, SearchStatusRow } from '@/components/ui/list-page-tools';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs } from '@/components/ui/tabs';
import { Table } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatErrorMessage } from '@/lib/format-error';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { payinStatusLabel } from '@/lib/order-status-ui';
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
  type OrderFinalizeMenuState,
} from './order-finalize-dropdown';
import {
  PayInAppealDecisionDropdown,
  type AppealDecisionMenuState,
} from './payin-appeal-decision-dropdown';
import {
  PayInProofViewerModal,
  PayInReceiptGalleryModal,
} from './payin-receipt-modals';
import { PayInOrderDetailModal } from './payin-order-detail-modal';
import { usePaginatedListState } from '@/lib/hooks/use-paginated-list-state';
import { useSelectedRowSync } from '@/lib/hooks/use-selected-row-sync';

const PAYIN_LIST_PAGE_SIZE = 20;

export function TraderPayInPage() {
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
    useClampToTotalPages,
  } = usePaginatedListState({
    pageSize: PAYIN_LIST_PAGE_SIZE,
    resetWhen: [listTab],
  });
  const [selectedOrder, setSelectedOrder] = useState<TraderPayInOrderDto | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<TraderPayInOrderDto | null>(null);
  const [viewingProofFileId, setViewingProofFileId] = useState<string | null>(null);
  const [finalizeMenu, setFinalizeMenu] = useState<OrderFinalizeMenuState>(null);
  const [appealDecisionMenu, setAppealDecisionMenu] = useState<AppealDecisionMenuState>(null);
  const [finalizeDialog, setFinalizeDialog] = useState<FinalizeDialogState | null>(null);

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
    limit: String(PAYIN_LIST_PAGE_SIZE),
  };
  if (statusFilter) queryParams.status = statusFilter;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: traderKeys.payinOrders(queryParams),
    queryFn: async () => {
      const { data: res, clockOffsetMs } = await api.getWithClockOffset<PayInListApiResponse>(
        internalPaths.traderPayinOrders,
        queryParams,
      );
      const limit = res.limit ?? PAYIN_LIST_PAGE_SIZE;
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
    mutationFn: ({ appealId, decision }: { appealId: string; decision: AppealStatus }) =>
      api.patch<AppealDto>(internalPaths.appealResolve(appealId), { decision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      void queryClient.invalidateQueries({ queryKey: traderKeys.appealsScope });
      toast.success('Appeal decision saved');
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
      toast.error('Enter a valid received amount');
      return;
    }
    const orderAmt = Number(order.amount);
    if (actual === orderAmt) {
      toast.error('Amount matches the order. Choose Paid instead, or enter a different amount.');
      return;
    }
    confirmMutation.mutate({ orderId: order.id, actualAmount: actual });
  }

  const allowedStatusesForTab =
    listTab === 'current' ? PAYIN_TRADER_CURRENT_STATUSES : PAYIN_TRADER_HISTORY_STATUSES;
  const statusOptions = allowedStatusesForTab.map((s) => ({
    value: s,
    label: payinStatusLabel(s),
  }));
  const statusSelectOptions = [{ value: '', label: 'All statuses' }, ...statusOptions];

  const timerOrCompletionColumn =
    listTab === 'history'
      ? {
          key: 'completed_at',
          header: 'Completion time',
          render: (row: TraderPayInOrderDto) => (
            <span className="text-text-muted text-sm whitespace-nowrap">
              {row.completed_at != null ? formatDateFull(row.completed_at) : '—'}
            </span>
          ),
        }
      : {
          key: 'timer',
          header: 'Time to complete',
          className: 'text-end font-mono tabular-nums',
          render: (row: TraderPayInOrderDto) => (
            <CountdownTimer
              autocloseAt={row.autoclose_at}
              createdAt={row.created_at}
              status={row.status}
              clockOffsetMs={data?.clockOffsetMs ?? 0}
            />
          ),
        };

  const columns = [
      {
        key: 'id',
        header: 'Order ID',
        className: 'min-w-[8rem]',
        render: (row: TraderPayInOrderDto) => <CopyOrderIdCell id={row.id} />,
      },
      {
        key: 'created_at',
        header: 'Created',
        render: (row: TraderPayInOrderDto) => (
          <span className="text-text-muted text-sm whitespace-nowrap">
            {formatDateFull(row.created_at)}
          </span>
        ),
      },
      timerOrCompletionColumn,
      {
        key: 'amount',
        header: 'Payment amount',
        className: 'text-end tabular-nums align-top',
        render: (row: TraderPayInOrderDto) => (
          <div className="flex flex-col items-end gap-0.5 leading-tight">
            <span className="font-semibold text-text-primary">
              {formatCurrency(row.amount, row.currency)}
            </span>
            {row.amount_equivalent_usdt != null ? (
              <span
                className="text-xs font-normal tabular-nums text-text-muted"
                title="USDT equivalent from snapshot rate when the order was quoted"
              >
                {row.amount_equivalent_usdt.toFixed(2)} USDT
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'requisite',
        header: 'Requisite',
        className: 'min-w-[7rem]',
        render: (row: TraderPayInOrderDto) => <PayinRequisiteTableCell row={row} />,
      },
      {
        key: 'status',
        header: 'Status',
        className: 'text-center align-top',
        render: (row: TraderPayInOrderDto) => (
          <PayInOrderStatusColumnCell row={row} onOpenReceipts={setReceiptOrder} />
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-end',
        render: (row: TraderPayInOrderDto) => {
          const openAppeal = (row.appeals ?? []).find((a) => a.status === AppealStatus.OPEN);
          const showAppealActions =
            row.status === PayInOrderStatus.APPEAL && openAppeal !== undefined;
          const appealBusy =
            resolveAppealMutation.isPending &&
            resolveAppealMutation.variables?.appealId === openAppeal?.id;

          return (
            <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {showAppealActions && (
                <PayInAppealDecisionDropdown
                  orderId={row.id}
                  appealId={openAppeal!.id}
                  menuState={appealDecisionMenu}
                  setMenuState={setAppealDecisionMenu}
                  menuAnchor="table"
                  loading={appealBusy}
                  onReject={() =>
                    resolveAppealMutation.mutate({
                      appealId: openAppeal!.id,
                      decision: AppealStatus.REJECTED,
                    })
                  }
                  onAccept={() =>
                    resolveAppealMutation.mutate({
                      appealId: openAppeal!.id,
                      decision: AppealStatus.RESOLVED,
                    })
                  }
                />
              )}
              <OrderFinalizeDropdown
                order={row}
                menuState={finalizeMenu}
                setMenuState={setFinalizeMenu}
                menuAnchor="table"
                onPickKind={(kind) => openFinalize(kind, row)}
              />
            </div>
          );
        },
      },
    ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={
          <div className="flex items-center gap-3">
            <ArrowDownToLine className="h-6 w-6 text-accent-green" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Pay-In Orders</h1>
              <p className="text-sm text-text-muted">
                {listTab === 'current'
                  ? 'Active requests: pending assignment, awaiting payer, or awaiting your confirmation.'
                  : 'Completed or closed orders: paid, canceled, appeal, or upload failed.'}{' '}
                <span className="text-text-secondary">({data?.total ?? 0} in this view)</span>
              </p>
            </div>
          </div>
        }
        actions={
          <Tabs
            tabs={[
              { key: 'current', label: 'Current' },
              { key: 'history', label: 'History' },
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
        }
      />

      <SearchStatusRow
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Order ID, request ID, requisite, or account owner..."
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
        emptyMessage="No pay-in orders found"
      />

      <PaginationControls
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        totalItems={data?.total ?? 0}
        itemLabel="orders"
        variant="minimal"
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
        onPickFinalizeKind={(kind, order) => openFinalize(kind, order)}
      />

      <PayInFinalizeConfirmationModal
        finalizeDialog={finalizeDialog}
        onClose={() => setFinalizeDialog(null)}
        setFinalizeDialog={setFinalizeDialog}
        onApply={() => commitFinalize()}
        confirmMutation={confirmMutation}
        cancelMutation={cancelMutation}
      />
    </div>
  );
}

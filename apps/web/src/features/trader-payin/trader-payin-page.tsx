'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, Eye, FileText } from 'lucide-react';
import type { OrderDto } from '@p2p/shared';
import { Button } from '@/components/ui/button';
import { PayinOrderStatusBadge } from '@/components/ui/order-status-badge';
import { IconButton } from '@/components/ui/icon-button';
import { Table } from '@/components/ui/table';
import { ListPageHeader, SearchStatusRow } from '@/components/ui/list-page-tools';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatErrorMessage } from '@/lib/format-error';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { payinStatusLabel } from '@/lib/order-status-ui';
import {
  PayInOrderStatus,
  PAYIN_TRADER_CURRENT_STATUSES,
  PAYIN_TRADER_HISTORY_STATUSES,
} from '@p2p/shared';
import { PayInFinalizeConfirmationModal } from './payin-finalize-confirmation-modal';
import type { FinalizeKind, FinalizeDialogState, PayInListApiResponse } from './payin-types';
import {
  orderPayinProofFileIds,
  payinDirectionLabel,
  parsePositiveAmount,
} from './payin-finalize-utils';
import { AppealCell, CopyOrderIdCell, CountdownTimer } from './payin-order-cells';
import {
  OrderFinalizeDropdown,
  type OrderFinalizeMenuState,
} from './order-finalize-dropdown';
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
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [viewingProofFileId, setViewingProofFileId] = useState<string | null>(null);
  const [finalizeMenu, setFinalizeMenu] = useState<OrderFinalizeMenuState>(null);
  const [finalizeDialog, setFinalizeDialog] = useState<FinalizeDialogState | null>(null);

  useEffect(() => {
    if (!finalizeMenu) return;
    const handler = (e: MouseEvent) => {
      const inside = (e.target as HTMLElement | null)?.closest(
        '[data-trader-payin-finalize-dropdown]',
      );
      if (!inside) setFinalizeMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [finalizeMenu]);

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

  function openFinalize(kind: FinalizeKind, order: OrderDto) {
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
          render: (row: OrderDto) => (
            <span className="text-text-muted text-sm whitespace-nowrap">
              {row.completed_at != null ? formatDateFull(row.completed_at) : '—'}
            </span>
          ),
        }
      : {
          key: 'timer',
          header: 'Time to complete',
          className: 'text-end font-mono tabular-nums',
          render: (row: OrderDto) => (
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
        render: (row: OrderDto) => <CopyOrderIdCell id={row.id} />,
      },
      {
        key: 'created_at',
        header: 'Created',
        render: (row: OrderDto) => (
          <span className="text-text-muted text-sm whitespace-nowrap">
            {formatDateFull(row.created_at)}
          </span>
        ),
      },
      timerOrCompletionColumn,
      {
        key: 'direction',
        header: 'Direction',
        className: 'text-center',
        render: (row: OrderDto) => (
          <span className="text-sm font-medium text-text-primary">{payinDirectionLabel(row)}</span>
        ),
      },
      {
        key: 'amount',
        header: 'Payment amount',
        className: 'text-end tabular-nums',
        render: (row: OrderDto) => (
          <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'text-center',
        render: (row: OrderDto) => <PayinOrderStatusBadge status={row.status} />,
      },
      {
        key: 'appeal',
        header: 'Appeal',
        className: 'text-center',
        render: (row: OrderDto) => <AppealCell row={row} />,
      },
      {
        key: 'receipt',
        header: 'Payment receipt',
        className: 'text-end',
        render: (row: OrderDto) => {
          const proofIds = orderPayinProofFileIds(row);
          const hasProofs = proofIds.length > 0;
          return (
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasProofs}
              onClick={(e) => {
                e.stopPropagation();
                if (hasProofs) setReceiptOrder(row);
              }}
            >
              <FileText className="h-4 w-4" />
              {hasProofs
                ? `Receipt${proofIds.length > 1 ? `s (${proofIds.length})` : ''}`
                : 'No receipt'}
            </Button>
          );
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-end',
        render: (row: OrderDto) => (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <OrderFinalizeDropdown
              order={row}
              menuState={finalizeMenu}
              setMenuState={setFinalizeMenu}
              menuAnchor="table"
              onPickKind={(kind) => openFinalize(kind, row)}
            />
            <IconButton label="View order details" onClick={() => setSelectedOrder(row)}>
              <Eye className="h-4 w-4" />
            </IconButton>
          </div>
        ),
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
        clockOffsetMs={data?.clockOffsetMs ?? 0}
        onClose={() => {
          setFinalizeMenu((m) => (m?.anchor === 'modal' ? null : m));
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

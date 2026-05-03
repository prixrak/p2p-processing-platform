'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  Filter,
  Eye,
  FileText,
} from 'lucide-react';
import type { OrderDto } from '@p2p/shared';
import { Button } from '@/components/ui/button';
import { PayinOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Table } from '@/components/ui/table';
import { FilterInput } from '@/components/ui/filters';
import { Tabs } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { formatErrorMessage } from '@/lib/format-error';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { usePayinTraderRealtime } from '@/lib/payin-realtime';
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
import { OrderFinalizeDropdown } from './order-finalize-dropdown';
import {
  PayInProofViewerModal,
  PayInReceiptGalleryModal,
} from './payin-receipt-modals';
import { PayInOrderDetailModal } from './payin-order-detail-modal';

export function TraderPayInPage() {
  const queryClient = useQueryClient();
  usePayinTraderRealtime(queryClient);
  const [listTab, setListTab] = useState<'current' | 'history'>('current');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [viewingProofFileId, setViewingProofFileId] = useState<string | null>(null);
  const [menuOpenOrderId, setMenuOpenOrderId] = useState<string | null>(null);
  const [finalizeDialog, setFinalizeDialog] = useState<FinalizeDialogState | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!menuOpenOrderId) return;
    const handler = (e: MouseEvent) => {
      const inside = (e.target as HTMLElement | null)?.closest(
        '[data-trader-payin-finalize-dropdown]',
      );
      if (!inside) setMenuOpenOrderId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenOrderId]);

  const queryParams: Record<string, string> = { list: listTab };
  if (statusFilter) queryParams.status = statusFilter;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: traderKeys.payinOrders(queryParams),
    queryFn: async () => {
      const res = await api.get<PayInListApiResponse>(internalPaths.traderPayinOrders, queryParams);
      return { orders: res.items, total: res.total };
    },
  });

  useEffect(() => {
    if (!selectedOrder || !data?.orders) return;
    const fresh = data.orders.find((o) => o.id === selectedOrder.id);
    if (fresh) setSelectedOrder(fresh);
  }, [data?.orders, selectedOrder?.id]);

  useEffect(() => {
    if (!receiptOrder || !data?.orders) return;
    const fresh = data.orders.find((o) => o.id === receiptOrder.id);
    if (fresh) setReceiptOrder(fresh);
  }, [data?.orders, receiptOrder?.id]);

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
      {
        key: 'timer',
        header: 'Time to complete',
        className: 'text-end font-mono tabular-nums',
        render: (row: OrderDto) => (
          <CountdownTimer autocloseAt={row.autoclose_at} createdAt={row.created_at} />
        ),
      },
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
              <FileText className="h-3.5 w-3.5" />
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
              menuOpenOrderId={menuOpenOrderId}
              setMenuOpenOrderId={setMenuOpenOrderId}
              onPickKind={(kind) => openFinalize(kind, row)}
            />
            <IconButton label="View order details" onClick={() => setSelectedOrder(row)}>
              <Eye className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ),
      },
    ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            tabs={[
              { key: 'current', label: 'Current' },
              { key: 'history', label: 'History' },
            ]}
            active={listTab}
            onChange={(k) => {
              const next = k as 'current' | 'history';
              setListTab(next);
              const allowed =
                next === 'current' ? PAYIN_TRADER_CURRENT_STATUSES : PAYIN_TRADER_HISTORY_STATUSES;
              setStatusFilter((prev) =>
                prev && allowed.includes(prev as PayInOrderStatus) ? prev : '',
              );
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      <FilterInput
        label="Search"
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Order ID, request ID, requisite, or account owner..."
        className="w-full max-w-md"
      />

      {showFilters && (
        <Card>
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
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter('')}>
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
        onClose={() => setSelectedOrder(null)}
        menuOpenOrderId={menuOpenOrderId}
        setMenuOpenOrderId={setMenuOpenOrderId}
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

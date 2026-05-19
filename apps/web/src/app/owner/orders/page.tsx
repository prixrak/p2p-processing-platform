'use client';

import { Suspense, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrderIdUrlParam } from '@/lib/hooks/use-order-id-url-param';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { ownerKeys } from '@/lib/query-keys';
import { buildQueryString, formatDateTime } from '@/lib/utils';
import { isPayinCabinetOrderRow } from '@/lib/is-payin-cabinet-order-row';
import { IconButton } from '@/components/ui/icon-button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayinRequisiteTableCell } from '@/components/ui/payin-requisite-table-cell';
import { ListPageHeader, SearchStatusRow } from '@/components/ui/list-page-tools';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { StatusHistoryList } from '@/components/ui/status-history-list';
import { StaffOrderStatusCell } from '@/components/ui/staff-order-status-cell';
import { PendingConfirmDialog } from '@/components/ui/pending-confirm-dialog';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import {
  adminOrderStatusConfirmCopy,
  type PendingAdminOrderStatusChange,
} from '@/lib/admin-order-status-confirm';
import {
  badgeVariantForPayin,
  badgeVariantForPayout,
  nextPayinStatuses,
  nextPayoutStatuses,
  payinStatusFilterOptions,
  payoutStatusFilterOptions,
} from '@/lib/order-status-ui';
import type { PaymentDetailsShortDto } from '@p2p/shared';

interface Order {
  id: string;
  type: 'PAYIN' | 'PAYOUT';
  merchantName: string;
  traderName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  payment_detail?: PaymentDetailsShortDto | null;
  trader_processing_method?: 'CARD' | 'FORK' | null;
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
  traderProcessingMethod?: string | null;
  forkExchangeReference?: string | null;
  forkChatProofFileIds?: string[];
  requisites?: { bank: string; cardNumber: string };
  statusHistory: { status: string; timestamp: string; actor: string }[];
}

const ORDER_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function OwnerOrdersPageContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('PAYIN');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const {
    value: searchInput,
    setValue: setSearchInput,
    debounced: debouncedSearch,
  } = useDebouncedTextFilter();

  const { orderId: detailOrder, openOrderDetail, closeOrderDetail } = useOrderIdUrlParam({
    validate: (s) => ORDER_ID_UUID_RE.test(s),
  });
  const [pendingStatusChange, setPendingStatusChange] =
    useState<PendingAdminOrderStatusChange | null>(null);

  const statusFilterOptions = useMemo(
    () => (tab === 'PAYIN' ? payinStatusFilterOptions : payoutStatusFilterOptions),
    [tab],
  );

  const { data, isLoading } = useQuery({
    queryKey: ownerKeys.orders(tab, page, statusFilter, debouncedSearch),
    queryFn: () => {
      const qs = buildQueryString({
        type: tab,
        page,
        limit: 20,
        status: statusFilter,
        search: debouncedSearch,
      });
      return api.get<OrdersResponse>(internalPaths.adminOrders(qs));
    },
  });

  const { data: details } = useQuery({
    queryKey: ownerKeys.orderDetails(detailOrder),
    queryFn: () =>
      api.get<OrderDetails>(internalPaths.adminOrder(detailOrder!)),
    enabled: !!detailOrder,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(internalPaths.adminOrderStatus(id), { status }),
    onSuccess: () => {
      setPendingStatusChange(null);
      queryClient.invalidateQueries({ queryKey: ownerKeys.ordersScope });
      queryClient.invalidateQueries({ queryKey: ownerKeys.orderDetailsScope });
    },
  });

  const columns = [
    {
      key: 'id',
      header: 'Order ID',
      className: 'font-mono tabular-nums text-end',
      render: (o: Order) => <OrderIdCopyCell id={o.id} label="Order ID" />,
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
      key: 'requisite',
      header: 'Requisite',
      className: 'min-w-[7rem]',
      render: (o: Order) =>
        isPayinCabinetOrderRow(o) ? (
          <PayinRequisiteTableCell row={o} />
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (o: Order) => (
        <StaffOrderStatusCell
          orderId={o.id}
          status={o.status}
          direction={o.type === 'PAYOUT' ? 'payout' : 'payin'}
        />
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (o: Order) => (
        <span className="text-sm text-text-muted">
          {formatDateTime(new Date(o.createdAt))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (o: Order) => {
        const next =
          o.type === 'PAYOUT'
            ? nextPayoutStatuses(o.status)
            : nextPayinStatuses(o.status);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <IconButton label="View order details" onClick={() => openOrderDetail(o.id)}>
              <Eye className="h-4 w-4" />
            </IconButton>
            {next.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                className="!px-2 !py-1 text-[10px] font-medium uppercase"
                loading={
                  updateStatus.isPending &&
                  updateStatus.variables?.id === o.id &&
                  updateStatus.variables?.status === s
                }
                onClick={() =>
                  setPendingStatusChange({
                    id: o.id,
                    status: s,
                    orderType: o.type,
                    amount: o.amount,
                    currency: o.currency,
                  })
                }
              >
                → {s}
              </Button>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={<h1 className="text-2xl font-bold text-text-primary">Orders</h1>}
        description="Manage all Pay-In and Pay-Out orders"
        actions={
          <Tabs
            tabs={[
              { key: 'PAYIN', label: 'Pay-In' },
              { key: 'PAYOUT', label: 'Pay-Out' },
            ]}
            active={tab}
            onChange={(k) => {
              setTab(k);
              setPage(1);
              setStatusFilter('');
            }}
          />
        }
      />

      <SearchStatusRow
        searchValue={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder="Search by ID or merchant..."
        statusValue={statusFilter}
        onStatusChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        statusOptions={statusFilterOptions}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No orders found"
      />

      <PendingConfirmDialog
        pending={pendingStatusChange}
        onOpenChange={(open) => !open && setPendingStatusChange(null)}
        getCopy={adminOrderStatusConfirmCopy}
        loading={updateStatus.isPending}
        onConfirm={({ id, status }) => updateStatus.mutate({ id, status })}
      />

      <Modal
        open={!!detailOrder}
        onClose={closeOrderDetail}
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
                <Badge
                  variant={
                    details.type === 'PAYOUT'
                      ? badgeVariantForPayout(details.status)
                      : badgeVariantForPayin(details.status)
                  }
                >
                  {details.status}
                </Badge>
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
                  {formatDateTime(new Date(details.createdAt))}
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
              {details.type === 'PAYIN' && details.traderProcessingMethod ? (
                <div>
                  <p className="text-xs text-text-muted">Pay-In routing</p>
                  <p className="text-sm text-text-primary">{details.traderProcessingMethod}</p>
                </div>
              ) : null}
              {details.type === 'PAYIN' && details.forkExchangeReference ? (
                <div className="col-span-2">
                  <p className="text-xs text-text-muted">Exchange reference (FORK)</p>
                  <p className="font-mono text-sm text-text-primary break-all">
                    {details.forkExchangeReference}
                  </p>
                </div>
              ) : null}
              {details.type === 'PAYIN' &&
              details.forkChatProofFileIds &&
              details.forkChatProofFileIds.length > 0 ? (
                <div className="col-span-2">
                  <p className="text-xs text-text-muted">Fork chat proof file IDs</p>
                  <p className="font-mono text-xs text-text-secondary break-all">
                    {details.forkChatProofFileIds.join(', ')}
                  </p>
                </div>
              ) : null}
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
              <StatusHistoryList entries={details.statusHistory} />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function OwnerOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl animate-fade-in space-y-6 p-6 text-text-muted">
          Loading…
        </div>
      }
    >
      <OwnerOrdersPageContent />
    </Suspense>
  );
}

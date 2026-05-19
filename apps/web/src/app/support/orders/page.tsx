'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrderIdUrlParam } from '@/lib/hooks/use-order-id-url-param';
import { useDebouncedTextFilter } from '@/lib/hooks/use-debounced-value';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { supportKeys } from '@/lib/query-keys';
import { IconButton } from '@/components/ui/icon-button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayinRequisiteTableCell } from '@/components/ui/payin-requisite-table-cell';
import { FilterInput, FilterSelect } from '@/components/ui/filters';
import { FilterFieldsRow, ListPageHeader } from '@/components/ui/list-page-tools';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { StatusHistoryList } from '@/components/ui/status-history-list';
import { SupportOrderStatusCell } from '@/components/ui/staff-order-status-cell';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import {
  badgeVariantForPayin,
  badgeVariantForPayout,
  payinStatusFilterOptions,
  payoutStatusFilterOptions,
} from '@/lib/order-status-ui';
import { buildQueryString, formatDateTime } from '@/lib/utils';
import { isPayinCabinetOrderRow } from '@/lib/is-payin-cabinet-order-row';
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

function SupportOrdersPageContent() {
  const [tab, setTab] = useState('PAYIN');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const {
    value: merchantFilter,
    setValue: setMerchantFilter,
    debounced: debouncedMerchantFilter,
  } = useDebouncedTextFilter();
  const {
    value: traderFilter,
    setValue: setTraderFilter,
    debounced: debouncedTraderFilter,
  } = useDebouncedTextFilter();

  const { orderId: detailOrder, openOrderDetail, closeOrderDetail } = useOrderIdUrlParam({
    validate: (s) => ORDER_ID_UUID_RE.test(s),
  });

  const statusFilterOptions = useMemo(
    () => (tab === 'PAYIN' ? payinStatusFilterOptions : payoutStatusFilterOptions),
    [tab],
  );

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, debouncedMerchantFilter, debouncedTraderFilter]);

  const { data, isLoading } = useQuery({
    queryKey: supportKeys.orders(
      tab,
      page,
      statusFilter,
      debouncedMerchantFilter,
      debouncedTraderFilter,
    ),
    queryFn: () => {
      const qs = buildQueryString({
        type: tab,
        page,
        limit: 20,
        status: statusFilter,
        merchant: debouncedMerchantFilter,
        trader: debouncedTraderFilter,
      });
      return api.get<OrdersResponse>(internalPaths.supportOrders(qs));
    },
  });

  const { data: details } = useQuery({
    queryKey: supportKeys.orderDetails(detailOrder),
    queryFn: () => api.get<OrderDetails>(internalPaths.supportOrder(detailOrder!)),
    enabled: !!detailOrder,
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
        <SupportOrderStatusCell
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
      header: '',
      className: 'w-12 text-center',
      render: (o: Order) => (
        <IconButton label="View order details" onClick={() => openOrderDetail(o.id)}>
          <Eye className="h-4 w-4" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={<h1 className="text-2xl font-bold text-text-primary">Orders</h1>}
        description="Read-only view of all platform orders"
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

      <FilterFieldsRow>
        <div className="w-full shrink-0 sm:w-44">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={statusFilterOptions}
            placeholder="All statuses"
          />
        </div>
        <FilterInput
          label="Merchant"
          value={merchantFilter}
          onChange={setMerchantFilter}
          placeholder="Merchant name..."
          className="min-w-0 w-full sm:flex-1 sm:basis-[12rem] sm:max-w-xs"
        />
        <FilterInput
          label="Trader"
          value={traderFilter}
          onChange={setTraderFilter}
          placeholder="Trader name..."
          className="min-w-0 w-full sm:flex-1 sm:basis-[12rem] sm:max-w-xs"
        />
      </FilterFieldsRow>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No orders found"
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

export default function SupportOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl animate-fade-in space-y-6 p-6 text-text-muted">
          Loading…
        </div>
      }
    >
      <SupportOrdersPageContent />
    </Suspense>
  );
}

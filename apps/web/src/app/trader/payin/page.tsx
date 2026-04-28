'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  RefreshCw,
  Filter,
  Eye,
  Copy,
  FileText,
  ExternalLink,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { FilterInput } from '@/components/ui/filters';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { usePayinTraderRealtime } from '@/lib/payin-realtime';
import { formatCurrency, formatDateFull, shortId, cn } from '@/lib/utils';
import { payinStatusVariant } from '@/lib/status-helpers';
import { payinStatusLabel } from '@/lib/order-status-ui';
import {
  PayInOrderStatus,
  PAYIN_TRADER_CURRENT_STATUSES,
  PAYIN_TRADER_HISTORY_STATUSES,
  AppealStatus,
} from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PayInListApiResponse {
  items: OrderDto[];
  total: number;
  page: number;
  limit: number;
}

type FinalizeKind = 'paid' | 'adjustment' | 'cancel';

interface FinalizeDialogState {
  order: OrderDto;
  kind: FinalizeKind;
  /** Raw input when kind is adjustment — actual received amount */
  adjustmentInput: string;
}

function maskRequisite(numberRaw: string | null | undefined): string {
  if (!numberRaw) return '—';
  const trimmed = numberRaw.replace(/\s/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function finalizeTargetPreview(order: OrderDto, kind: FinalizeKind, actual?: number): string {
  const orderAmt = Number(order.amount);
  if (kind === 'paid') return 'Paid';
  if (kind === 'adjustment') {
    if (actual === undefined) return 'Adjusted (enter amount)';
    if (actual === orderAmt) return 'Paid';
    if (actual < orderAmt) return 'Underpaid';
    return 'Overpaid';
  }
  return 'Canceled';
}

/** Accent for the preview line describing the upcoming status label */
function finalizePreviewTone(
  order: OrderDto,
  kind: FinalizeKind,
  adjustmentInput: string,
): string {
  if (kind === 'paid') return 'text-accent-green';
  if (kind === 'cancel') return 'text-accent-red';
  const actual = parsePositiveAmount(adjustmentInput);
  if (actual === null) return 'text-text-secondary';
  const o = Number(order.amount);
  if (actual === o) return 'text-accent-green';
  if (actual < o) return 'text-warning';
  return 'text-accent-purple';
}

function finalizeOptionsForOrder(order: OrderDto): FinalizeKind[] {
  if (order.status === PayInOrderStatus.VERIFIED) {
    return ['paid', 'adjustment', 'cancel'];
  }
  if (order.status === PayInOrderStatus.NEW) {
    return ['cancel'];
  }
  if (order.status === PayInOrderStatus.CANCELED) {
    return ['paid', 'adjustment'];
  }
  return [];
}

function orderPayinProofFileIds(row: OrderDto): string[] {
  const ids: string[] = [];
  for (const a of row.appeals ?? []) {
    for (const f of a.proofs_of_payment) ids.push(f);
  }
  return ids;
}

function payinDirectionLabel(row: OrderDto): string {
  const t = row.payment_detail?.type;
  if (t === 'CARD' || t === 'IBAN') return t;
  return '—';
}

function CountdownTimer({ autocloseAt }: { autocloseAt: number | null }) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!autocloseAt) return;

    function update() {
      const diff = autocloseAt! * 1000 - Date.now();
      setRemaining(Math.max(0, diff));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [autocloseAt]);

  if (!autocloseAt) return <span className="text-text-muted">-</span>;

  const isExpired = remaining <= 0;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <span
      className={cn(
        'font-mono text-sm font-medium',
        isExpired ? 'text-accent-red animate-pulse-soft' : 'text-accent-green',
      )}
    >
      {isExpired ? 'EXPIRED' : `${minutes}:${seconds.toString().padStart(2, '0')}`}
    </span>
  );
}

function CopyOrderIdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Order ID copied');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  return (
    <button
      type="button"
      title={id}
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-primary bg-surface-tertiary/40 px-2 py-1 text-left transition-colors hover:border-accent-blue hover:bg-surface-tertiary"
    >
      <span className="truncate font-mono text-xs text-text-primary">{shortId(id)}</span>
      <Copy className={cn('h-3.5 w-3.5 shrink-0 text-text-muted', copied && 'text-accent-green')} />
    </button>
  );
}

function AppealCell({ row }: { row: OrderDto }) {
  const appeals = row.appeals ?? [];
  if (appeals.length === 0) {
    if (row.status === PayInOrderStatus.APPEAL) {
      return (
        <Badge variant="warning" dot>
          Appeal
        </Badge>
      );
    }
    return <span className="text-text-muted">—</span>;
  }

  const open = appeals.filter((a) => a.status === AppealStatus.OPEN);
  const rejected = appeals.some((a) => a.status === AppealStatus.REJECTED);
  if (open.length > 0) {
    return (
      <Badge variant="warning" dot>
        Open{open.length > 1 ? ` (${open.length})` : ''}
      </Badge>
    );
  }
  if (rejected) {
    return (
      <Badge variant="danger" dot>
        Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="success" dot>
      Resolved
    </Badge>
  );
}

function OrderFinalizeDropdown({
  order,
  menuOpenOrderId,
  setMenuOpenOrderId,
  onPickKind,
}: {
  order: OrderDto;
  menuOpenOrderId: string | null;
  setMenuOpenOrderId: (id: string | null) => void;
  onPickKind: (kind: FinalizeKind) => void;
}) {
  const opts = finalizeOptionsForOrder(order);
  if (opts.length === 0) return null;

  const open = menuOpenOrderId === order.id;

  const optionClasses: Record<
    Exclude<FinalizeKind, 'cancel'>,
    string
  > = {
    paid: 'border-accent-green text-accent-green hover:bg-accent-green/10',
    adjustment: 'border-accent-purple text-accent-purple hover:bg-accent-purple/10',
  };

  return (
    <div
      className="relative inline-block text-left"
      data-trader-payin-finalize-dropdown
    >
      <Button
        size="sm"
        variant="primary"
        className="gap-1"
        onClick={() => setMenuOpenOrderId(open ? null : order.id)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Change status
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1 flex min-w-[12.5rem] flex-col gap-1 rounded-lg border border-border-primary bg-surface-secondary p-1.5 shadow-xl"
          role="menu"
        >
          {opts.includes('paid') && (
            <button
              type="button"
              role="menuitem"
              className={cn(
                'rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
                optionClasses.paid,
              )}
              onClick={() => {
                setMenuOpenOrderId(null);
                onPickKind('paid');
              }}
            >
              Paid
            </button>
          )}
          {opts.includes('adjustment') && (
            <button
              type="button"
              role="menuitem"
              className={cn(
                'rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
                optionClasses.adjustment,
              )}
              onClick={() => {
                setMenuOpenOrderId(null);
                onPickKind('adjustment');
              }}
            >
              Adjustment
            </button>
          )}
          {opts.includes('cancel') && (
            <button
              type="button"
              role="menuitem"
              className="rounded-md border border-accent-red px-3 py-2 text-left text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/10"
              onClick={() => {
                setMenuOpenOrderId(null);
                onPickKind('cancel');
              }}
            >
              Canceled
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PayInOrdersPage() {
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trader', 'payin-orders', queryParams],
    queryFn: async () => {
      const res = await api.get<PayInListApiResponse>('/api/trader/payin/orders', queryParams);
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
      api.post(`/api/trader/payin/orders/${vars.orderId}/confirm`, {
        orderId: vars.orderId,
        ...(vars.actualAmount !== undefined ? { actualAmount: vars.actualAmount } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payin-orders'] });
      setSelectedOrder(null);
      setFinalizeDialog(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/api/trader/payin/orders/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'payin-orders'] });
      setSelectedOrder(null);
      setFinalizeDialog(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Request failed');
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
      render: (row: OrderDto) => <CountdownTimer autocloseAt={row.autoclose_at} />,
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
      render: (row: OrderDto) => (
        <Badge variant={payinStatusVariant[row.status]} dot>
          {payinStatusLabel(row.status)}
        </Badge>
      ),
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
            {hasProofs ? `Receipt${proofIds.length > 1 ? `s (${proofIds.length})` : ''}` : 'No receipt'}
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

  const receiptProofIds = receiptOrder ? orderPayinProofFileIds(receiptOrder) : [];

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
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
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
        <Card className="animate-slide-up">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
              }}
            >
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

      <Modal
        open={!!receiptOrder}
        onClose={() => {
          setReceiptOrder(null);
          setViewingProofFileId(null);
        }}
        title="Payment receipts"
        size="lg"
      >
        {receiptOrder && receiptProofIds.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              Order <span className="font-mono text-text-secondary">{shortId(receiptOrder.id)}</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {receiptProofIds.map((fileId) => (
                <button
                  key={fileId}
                  type="button"
                  onClick={() => setViewingProofFileId(fileId)}
                  className="group relative aspect-video overflow-hidden rounded-lg border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue cursor-pointer"
                >
                  <img
                    src={`${API_BASE}/api/files/${fileId}`}
                    alt="Payment receipt"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden flex-col items-center justify-center absolute inset-0 text-text-muted">
                    <FileText className="mb-1 h-6 w-6" />
                    <span className="text-xs">View file</span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <ExternalLink className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewingProofFileId}
        onClose={() => setViewingProofFileId(null)}
        title="Payment receipt"
        size="xl"
      >
        {viewingProofFileId && (
          <div className="flex items-center justify-center">
            <img
              src={`${API_BASE}/api/files/${viewingProofFileId}`}
              alt="Payment receipt"
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title="Pay-In Order Details"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedOrder.id} mono />
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <DetailRow label="Amount" value={formatCurrency(selectedOrder.amount, selectedOrder.currency)} />
              <DetailRow label="Currency" value={selectedOrder.currency || '—'} />
              <DetailRow label="Commission" value={formatCurrency(selectedOrder.commission, selectedOrder.currency)} />
              <DetailRow
                label="Partner amount"
                value={formatCurrency(selectedOrder.partner_amount, selectedOrder.currency)}
              />
              <DetailRow label="Rate" value={String(selectedOrder.rate)} />
              <DetailRow label="Direction" value={payinDirectionLabel(selectedOrder)} />
              <DetailRow label="Status">
                <Badge variant={payinStatusVariant[selectedOrder.status]} dot>
                  {payinStatusLabel(selectedOrder.status)}
                </Badge>
              </DetailRow>
              <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              <DetailRow label="Bank" value={selectedOrder.bank || '-'} />
              <DetailRow label="Requisite" value={selectedOrder.requisite_number || '-'} mono />
              <DetailRow label="Owner" value={selectedOrder.requisite_owner || '-'} />
              <DetailRow label="Time to complete">
                <CountdownTimer autocloseAt={selectedOrder.autoclose_at} />
              </DetailRow>
            </div>

            {selectedOrder.appeals && selectedOrder.appeals.length > 0 && (
              <div className="rounded-lg border border-border-primary p-4">
                <h3 className="mb-2 text-sm font-medium text-text-secondary">Appeals</h3>
                {selectedOrder.appeals.map((appeal) => (
                  <div key={appeal.id} className="flex items-center gap-4 text-sm">
                    <Badge
                      variant={
                        appeal.status === 'OPEN'
                          ? 'warning'
                          : appeal.status === 'RESOLVED'
                            ? 'success'
                            : 'danger'
                      }
                    >
                      {appeal.status}
                    </Badge>
                    <span>Paid: {formatCurrency(appeal.paid_amount, selectedOrder.currency)}</span>
                    <span className="text-text-muted">{formatDateFull(appeal.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedOrder.status === PayInOrderStatus.NEW && (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Waiting for payer:</span> they must confirm
                they sent the transfer (status becomes Verified). Only then you can confirm you received the
                funds. You can cancel this order if needed.
              </p>
            )}

            {selectedOrder.status === PayInOrderStatus.CANCELED && (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Canceled order:</span> if the payer actually
                completed the transfer, use Change status to mark Paid or enter an adjustment (underpaid /
                overpaid).
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <OrderFinalizeDropdown
                order={selectedOrder}
                menuOpenOrderId={menuOpenOrderId}
                setMenuOpenOrderId={setMenuOpenOrderId}
                onPickKind={(kind) => openFinalize(kind, selectedOrder)}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={finalizeDialog !== null}
        onClose={() => setFinalizeDialog(null)}
        title="Are you sure?"
        size="sm"
      >
        {finalizeDialog && (
          <>
            <div className="-mt-2 flex justify-center pb-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-warning/35 text-warning"
                aria-hidden
              >
                <AlertTriangle className="h-7 w-7" />
              </div>
            </div>

            {finalizeDialog.kind === 'adjustment' && (
              <div className="mb-4">
                <label
                  htmlFor="finalize-adjustment-amount"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Actual amount received
                </label>
                <input
                  id="finalize-adjustment-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={String(finalizeDialog.order.amount)}
                  value={finalizeDialog.adjustmentInput}
                  onChange={(e) =>
                    setFinalizeDialog((prev) =>
                      prev ? { ...prev, adjustmentInput: e.target.value } : prev,
                    )
                  }
                  className="w-full rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Use when the received amount differs from the order total. Leave other choices for exact
                  matches.
                </p>
              </div>
            )}

            {(() => {
              const fd = finalizeDialog;
              const adjParsed =
                fd.kind === 'adjustment' ? parsePositiveAmount(fd.adjustmentInput) : null;
              const statusPreviewArg =
                fd.kind === 'adjustment' ? adjParsed ?? undefined : undefined;

              const statusWords = finalizeTargetPreview(fd.order, fd.kind, statusPreviewArg);
              const applyLoading =
                (confirmMutation.isPending &&
                  confirmMutation.variables?.orderId === fd.order.id) ||
                (cancelMutation.isPending && cancelMutation.variables === fd.order.id);
              const applyDisabled =
                fd.kind === 'adjustment' &&
                (adjParsed === null ||
                  adjParsed === Number(fd.order.amount));

              return (
                <>
                  <div className="divide-y divide-border-primary rounded-lg border border-border-primary">
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="shrink-0 text-xs text-text-muted">Status will change to</span>
                      <span
                        className={cn(
                          'text-sm font-semibold sm:text-end',
                          finalizePreviewTone(fd.order, fd.kind, fd.adjustmentInput),
                        )}
                      >
                        {statusWords}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="shrink-0 text-xs text-text-muted">Account / requisite</span>
                      <span className="break-all font-mono text-xs text-text-primary sm:text-end">
                        {maskRequisite(fd.order.requisite_number ?? fd.order.payment_detail?.number)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="shrink-0 text-xs text-text-muted">Order amount</span>
                      <span className="text-sm font-medium text-accent-green sm:text-end">
                        {formatCurrency(fd.order.amount, fd.order.currency)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="shrink-0 text-xs text-text-muted">Owner</span>
                      <span className="break-all font-mono text-xs text-text-primary sm:text-end">
                        {fd.order.requisite_owner || fd.order.payment_detail?.owner || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      className="flex-1"
                      loading={applyLoading}
                      disabled={applyDisabled}
                      onClick={() => commitFinalize()}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      className="flex-1"
                      disabled={applyLoading}
                      onClick={() => setFinalizeDialog(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              );
            })()}
          </>
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

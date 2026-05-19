'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PayinOrderStatusBadge, PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { payinStatusVariant, payoutStatusVariant } from '@/lib/status-helpers';

export type OrderStatusHistoryItem = {
  status: string;
  timestamp: string;
  actor: string;
  note?: string | null;
};

type OrderStatusHistoryResponse = {
  items: OrderStatusHistoryItem[];
};

const timelineDotClass: Record<string, string> = {
  success: 'border-emerald-500 bg-emerald-500/15',
  warning: 'border-amber-500 bg-amber-500/15',
  danger: 'border-red-500 bg-red-500/15',
  info: 'border-sky-500 bg-sky-500/15',
  muted: 'border-border-primary bg-surface-primary',
  default: 'border-border-primary bg-surface-primary',
};

function dotClassForStatus(direction: 'payin' | 'payout', status: string): string {
  const variant =
    direction === 'payin'
      ? (payinStatusVariant[status] ?? 'default')
      : (payoutStatusVariant[status] ?? 'default');
  return timelineDotClass[variant] ?? timelineDotClass.default;
}

function StatusBadgeForDirection({
  direction,
  status,
  label,
}: {
  direction: 'payin' | 'payout';
  status: string;
  label?: string;
}) {
  if (direction === 'payin') {
    return <PayinOrderStatusBadge status={status} label={label} />;
  }
  return <PayoutOrderStatusBadge status={status} />;
}

export function OrderStatusHistoryModal({
  open,
  onClose,
  orderId,
  fetchPath,
  direction,
  title = 'Status history',
  statusLabel,
  changedByLabel = 'Changed by',
  emptyLabel = 'No status changes recorded for this order yet.',
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  orderId: string | null;
  fetchPath: string | null;
  direction: 'payin' | 'payout';
  title?: string;
  statusLabel?: (status: string) => string;
  changedByLabel?: string;
  emptyLabel?: string;
  closeLabel?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-status-history', fetchPath, orderId],
    queryFn: () => api.get<OrderStatusHistoryResponse>(fetchPath!),
    enabled: open && !!fetchPath && !!orderId,
  });

  /** API returns oldest-first; show newest at the top of the timeline. */
  const items = useMemo(
    () => [...(data?.items ?? [])].reverse(),
    [data?.items],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={orderId ? `Order ${orderId}` : undefined}
      size="lg"
      closeOnBackdropClick
    >
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-danger">Could not load status history.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ol className="relative max-h-[min(60vh,520px)] overflow-y-auto pl-2">
          {items.map((entry, index) => {
            const at = new Date(entry.timestamp);
            const timeShort = at.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });
            const isLast = index === items.length - 1;

            return (
              <li
                key={`${entry.timestamp}-${entry.status}-${index}`}
                className="relative flex gap-4 pb-8"
              >
                {!isLast ? (
                  <span
                    className="absolute left-[1.125rem] top-8 bottom-0 w-px bg-border-primary"
                    aria-hidden
                  />
                ) : null}
                <TimelineTime timeShort={timeShort} />
                <span
                  className={clsx(
                    'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2',
                    dotClassForStatus(direction, entry.status),
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1.5 pb-1">
                  <StatusBadgeForDirection
                    direction={direction}
                    status={entry.status}
                    label={statusLabel?.(entry.status)}
                  />
                  <p className="text-xs tabular-nums text-text-muted">{formatDateTime(at)}</p>
                  <p className="text-sm text-text-secondary">
                    <span className="text-text-muted">{changedByLabel}: </span>
                    {entry.actor}
                  </p>
                  {entry.note ? <p className="text-xs text-text-muted">{entry.note}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <HistoryModalFooter onClose={onClose} closeLabel={closeLabel} />
    </Modal>
  );
}

function TimelineTime({ timeShort }: { timeShort: string }) {
  return (
    <div className="w-14 shrink-0 pt-0.5 text-right">
      <span className="text-sm font-semibold tabular-nums text-text-primary">{timeShort}</span>
    </div>
  );
}

function HistoryModalFooter({
  onClose,
  closeLabel,
}: {
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end border-t border-border-primary pt-4">
      <Button type="button" variant="secondary" onClick={onClose}>
        {closeLabel}
      </Button>
    </div>
  );
}

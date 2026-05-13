'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { formatCurrency, formatDate, shortId, formatDurationShort, formatCountdownRemaining, cn } from '@/lib/utils';
import { TraderPayoutWorkflowActions, type PayoutRejectVars } from './trader-payout-workflow-actions';
import { TraderPayoutTakeFromPoolButton } from './trader-payout-take-from-pool-button';

export type PayoutTableVariant = 'standard' | 'specialist';

function LiveElapsed({
  fromUnix,
  warnAfterSec,
  critAfterSec,
}: {
  fromUnix: number | null | undefined;
  /** When both hints are set, elapsed duration changes color and pulses after thresholds. */
  warnAfterSec?: number;
  critAfterSec?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fromUnix == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fromUnix]);
  if (fromUnix == null) {
    return <span className="text-text-muted">—</span>;
  }
  const sec = Math.max(0, Math.floor(now / 1000) - fromUnix);
  const tiered =
    warnAfterSec != null &&
    critAfterSec != null &&
    warnAfterSec < critAfterSec;
  if (!tiered) {
    return (
      <span className="tabular-nums text-sm text-text-secondary">{formatDurationShort(sec)}</span>
    );
  }
  const stressed = sec >= critAfterSec;
  const warn = sec >= warnAfterSec;
  return (
    <span
      className={cn(
        'inline-flex min-w-[3.5rem] justify-end rounded-md border px-1.5 py-0.5 font-mono tabular-nums text-sm transition-colors duration-300',
        stressed
          ? 'border-accent-red/45 bg-accent-red/10 font-semibold text-accent-red'
          : warn
            ? 'border-accent-yellow/40 bg-accent-yellow/10 font-medium text-accent-yellow'
            : 'border-accent-green/35 bg-accent-green/10 font-medium text-accent-green',
      )}
    >
      {formatDurationShort(sec)}
    </span>
  );
}

function CopyOrderIdCell({ id }: { id: string }) {
  return <OrderIdCopyCell id={id} variant="inline" />;
}

function PoolCloseCountdown({ untilUnix }: { untilUnix: number | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (untilUnix == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [untilUnix]);

  if (untilUnix == null) {
    return <span className="text-text-muted">—</span>;
  }

  const nowSec = Math.floor(now / 1000);
  const remainingSec = Math.max(0, untilUnix - nowSec);

  return (
    <span
      className={cn(
        'font-mono tabular-nums text-sm text-text-secondary',
        nowSec >= untilUnix && 'font-medium text-accent-yellow',
      )}
    >
      {formatCountdownRemaining(remainingSec)}
    </span>
  );
}

export function buildPayoutPoolColumns(opts: {
  variant?: PayoutTableVariant;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
}) {
  const { takeFromPoolMutation } = opts;

  return [
    {
      key: 'id',
      header: 'ID',
      className: 'font-mono tabular-nums text-end',
      render: (row: PayOutOrderApiDto) => <CopyOrderIdCell id={row.id} />,
    },
    {
      key: 'pool_close',
      header: 'Time to close',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <PoolCloseCountdown untilUnix={row.pool_close_deadline_at} />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end tabular-nums',
      render: (row: PayOutOrderApiDto) => (
        <span className="font-semibold text-accent-blue">
          {formatCurrency(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => <PayoutOrderStatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <TraderPayoutTakeFromPoolButton
            order={row}
            takeFromPoolMutation={takeFromPoolMutation}
            layout="icon"
          />
        </div>
      ),
    },
  ];
}

export type PayoutCompleteVars = {
  orderId: string;
  completionProofFileId?: string;
  completionProofFileIds?: string[];
};

export function buildPayoutOrdersColumns(opts: {
  variant?: PayoutTableVariant;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  attachCompletionProofMutation?: UseMutationResult<
    PayOutOrderApiDto,
    unknown,
    { orderId: string; fileIds: string[] }
  >;
  onView: (row: PayOutOrderApiDto) => void;
}) {
  const {
    variant = 'standard',
    processMutation,
    completeMutation,
    cancelMutation,
    rejectMutation,
    attachCompletionProofMutation,
    onView,
  } = opts;
  const isSpecialist = variant === 'specialist';

  const idCol = {
    key: 'id',
    header: 'ID',
    className: 'font-mono tabular-nums text-end',
    render: (row: PayOutOrderApiDto) =>
      isSpecialist ? (
        <CopyOrderIdCell id={row.id} />
      ) : (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
  };

  const amountCol = {
    key: 'amount',
    header: 'Amount',
    className: 'text-end tabular-nums',
    render: (row: PayOutOrderApiDto) => (
      <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
    ),
  };

  const specialistMid = isSpecialist
    ? [
        {
          key: 'usdt_est',
          header: '~USDT',
          className: 'text-end tabular-nums text-sm',
          render: (row: PayOutOrderApiDto) => (
            <span className="text-text-secondary">
              {row.amount_usdt_estimate != null ? row.amount_usdt_estimate.toFixed(2) : '—'}
            </span>
          ),
        },
        {
          key: 'method',
          header: 'Method',
          render: (row: PayOutOrderApiDto) => (
            <span className="text-xs text-text-secondary">{row.payment_method_name ?? '—'}</span>
          ),
        },
        {
          key: 'active',
          header: 'Active',
          render: (row: PayOutOrderApiDto) =>
            row.status === PayOutOrderStatus.PROCESSING ? (
              <LiveElapsed fromUnix={row.start_at} warnAfterSec={180} critAfterSec={600} />
            ) : (
              <span className="text-text-muted">—</span>
            ),
        },
      ]
    : [];

  const tail = [
    {
      key: 'currency',
      header: 'Currency',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-secondary">{row.currency}</span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.details.number}</span>
          {row.details.owner && (
            <span className="text-xs text-text-muted">{row.details.owner}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: PayOutOrderApiDto) => <PayoutOrderStatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <TraderPayoutWorkflowActions
            order={row}
            processMutation={processMutation}
            completeMutation={completeMutation}
            cancelMutation={cancelMutation}
            rejectMutation={rejectMutation}
            attachCompletionProofMutation={attachCompletionProofMutation}
            layout="cell"
          />
          <IconButton label="View order details" onClick={() => onView(row)}>
            <Eye className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return [idCol, amountCol, ...specialistMid, ...tail];
}

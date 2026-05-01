'use client';

import { useEffect, useState } from 'react';
import {
  Play,
  Eye,
  CheckCircle2,
  XCircle,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { formatCurrency, formatDate, shortId, formatDurationShort, cn } from '@/lib/utils';

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
          ? 'border-accent-red/45 bg-accent-red/10 font-semibold text-accent-red animate-countdown-urgent-pulse'
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
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="font-mono text-xs text-text-muted">{shortId(id)}</span>
      <IconButton
        label="Copy full order ID"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(id);
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
export function buildPayoutPoolColumns(opts: {
  variant?: PayoutTableVariant;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  onView: (row: PayOutOrderApiDto) => void;
}) {
  const { variant = 'standard', takeFromPoolMutation, onView } = opts;
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
      <span className="font-semibold text-accent-blue">
        {formatCurrency(row.amount, row.currency)}
      </span>
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
          key: 'in_pool',
          header: 'In pool',
          render: (row: PayOutOrderApiDto) => <LiveElapsed fromUnix={row.pool_assigned_at} />,
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
      key: 'created_at',
      header: 'Created',
      render: (row: PayOutOrderApiDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => takeFromPoolMutation.mutate(row.id)}
            loading={takeFromPoolMutation.isPending}
          >
            <Play className="h-3.5 w-3.5" />
            Take
          </Button>
          <IconButton label="View order details" onClick={() => onView(row)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  return [idCol, amountCol, ...specialistMid, ...tail];
}

export type PayoutCompleteVars = { orderId: string; completionProofFileId?: string };

export function buildPayoutOrdersColumns(opts: {
  variant?: PayoutTableVariant;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  failMutation: UseMutationResult<unknown, unknown, string>;
  onView: (row: PayOutOrderApiDto) => void;
}) {
  const {
    variant = 'standard',
    processMutation,
    completeMutation,
    failMutation,
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
      header: 'Actions',
      className: 'text-end',
      render: (row: PayOutOrderApiDto) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === PayOutOrderStatus.NEW && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => processMutation.mutate(row.id)}
              loading={processMutation.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              Process
            </Button>
          )}
          {row.status === PayOutOrderStatus.PROCESSING && (
            <>
              <Button
                size="sm"
                variant="success"
                onClick={() => completeMutation.mutate({ orderId: row.id })}
                loading={completeMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => failMutation.mutate(row.id)}
                loading={failMutation.isPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Fail
              </Button>
            </>
          )}
          <IconButton label="View order details" onClick={() => onView(row)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  return [idCol, amountCol, ...specialistMid, ...tail];
}

'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { OrderStatusColumnWithHistory } from '@/components/ui/order-status-column-with-history';
import { payoutStatusLabel } from '@/lib/order-status-ui';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus } from '@p2p/shared';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
import { formatCurrency, formatDate, formatDurationShort, formatCountdownRemaining, cn } from '@/lib/utils';
import { TraderPayoutWorkflowActions, type PayoutRejectVars } from './trader-payout-workflow-actions';
import { TraderPayoutTakeFromPoolButton } from './trader-payout-take-from-pool-button';

export type PayoutTableVariant = 'standard' | 'specialist';

type PayoutT = any;

export function PayoutProcessingElapsed({
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
  return <OrderIdCopyCell id={id} />;
}

function payoutCardNumberCopyValue(number: string): string {
  return number.trim().replace(/\s+/g, '');
}

function payoutAmountCopyValue(amount: number): string {
  return amount.toFixed(2);
}

export function PayoutAmountCopyCell({
  amount,
  currency,
  copyLabel,
  className,
}: {
  amount: number;
  currency: string;
  copyLabel: string;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <span className={className}>{formatCurrency(amount, currency)}</span>
      <OrderIdCopyCell
        id={payoutAmountCopyValue(amount)}
        withToast
        label={copyLabel}
      />
    </span>
  );
}

export function PayoutRecipientNumberCopyCell({
  number,
  copyLabel,
}: {
  number: string;
  copyLabel: string;
}) {
  const copyValue = payoutCardNumberCopyValue(number);
  if (!copyValue) {
    return <span className="text-text-muted">—</span>;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="truncate font-mono text-xs">{number}</span>
      <OrderIdCopyCell id={copyValue} withToast label={copyLabel} />
    </span>
  );
}

function PayoutStatusWithHistory({
  row,
  statusHistoryPath,
  t,
}: {
  row: PayOutOrderCabinetDto;
  statusHistoryPath: (orderId: string) => string;
  t: PayoutT;
}) {
  return (
    <OrderStatusColumnWithHistory
      orderId={row.id}
      fetchPath={statusHistoryPath(row.id)}
      direction="payout"
      historyLabel={t('statusHistoryLabel')}
      modalTitle={t('statusHistoryTitle')}
      changedByLabel={t('statusHistoryChangedBy')}
      emptyLabel={t('statusHistoryEmpty')}
      closeLabel={t('statusHistoryClose')}
      statusLabel={payoutStatusLabel}
    >
      <PayoutOrderStatusBadge status={row.status} />
    </OrderStatusColumnWithHistory>
  );
}

export function PayoutPoolCloseCountdown({ untilUnix }: { untilUnix: number | null | undefined }) {
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
  statusHistoryPath: (orderId: string) => string;
  t: PayoutT;
}) {
  const { takeFromPoolMutation, statusHistoryPath, t } = opts;

  return [
    {
      key: 'id',
      header: t('colId'),
      className: 'font-mono tabular-nums text-end',
      mobilePrimary: true,
      render: (row: PayOutOrderCabinetDto) => <CopyOrderIdCell id={row.id} />,
    },
    {
      key: 'pool_close',
      header: t('colTimeToClose'),
      className: 'text-end',
      render: (row: PayOutOrderCabinetDto) => (
        <PayoutPoolCloseCountdown untilUnix={row.pool_close_deadline_at} />
      ),
    },
    {
      key: 'amount',
      header: t('colAmount'),
      className: 'text-end tabular-nums',
      mobilePrimary: true,
      render: (row: PayOutOrderCabinetDto) => (
        <PayoutAmountCopyCell
          amount={row.amount}
          currency={row.currency}
          copyLabel={t('colAmount')}
          className="font-semibold text-accent-blue"
        />
      ),
    },
    {
      key: 'status',
      header: t('colStatus'),
      className: 'text-center',
      mobilePrimary: true,
      render: (row: PayOutOrderCabinetDto) => (
        <PayoutStatusWithHistory row={row} statusHistoryPath={statusHistoryPath} t={t} />
      ),
    },
    {
      key: 'actions',
      header: t('colActions'),
      className: 'text-end',
      render: (row: PayOutOrderCabinetDto) => (
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
  statusHistoryPath: (orderId: string) => string;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  attachCompletionProofMutation?: UseMutationResult<
    PayOutOrderCabinetDto,
    unknown,
    { orderId: string; fileIds: string[] }
  >;
  detachCompletionProofMutation?: UseMutationResult<
    PayOutOrderCabinetDto,
    unknown,
    { orderId: string; fileId: string }
  >;
  onView: (row: PayOutOrderCabinetDto) => void;
  t: PayoutT;
}) {
  const {
    variant = 'standard',
    statusHistoryPath,
    processMutation,
    completeMutation,
    cancelMutation,
    rejectMutation,
    attachCompletionProofMutation,
    detachCompletionProofMutation,
    onView,
    t,
  } = opts;
  const isSpecialist = variant === 'specialist';

  const idCol = {
    key: 'id',
    header: t('colId'),
    className: 'font-mono tabular-nums text-end',
    mobilePrimary: true,
    render: (row: PayOutOrderCabinetDto) => <CopyOrderIdCell id={row.id} />,
  };

  const amountCol = {
    key: 'amount',
    header: t('colAmount'),
    className: 'text-end tabular-nums',
    mobilePrimary: true,
    render: (row: PayOutOrderCabinetDto) => (
      <PayoutAmountCopyCell
        amount={row.amount}
        currency={row.currency}
        copyLabel={t('colAmount')}
        className="font-medium"
      />
    ),
  };

  const specialistMid = isSpecialist
    ? [
        {
          key: 'usdt_est',
          header: t('colUsdtEstimate'),
          className: 'text-end tabular-nums text-sm',
          render: (row: PayOutOrderCabinetDto) => (
            <span className="text-text-secondary">
              {row.amount_usdt_estimate != null ? row.amount_usdt_estimate.toFixed(2) : '—'}
            </span>
          ),
        },
        {
          key: 'method',
          header: t('colMethod'),
          render: (row: PayOutOrderCabinetDto) => (
            <span className="text-xs text-text-secondary">{row.payment_method_name ?? '—'}</span>
          ),
        },
        {
          key: 'active',
          header: t('colActive'),
          render: (row: PayOutOrderCabinetDto) =>
            row.status === PayOutOrderStatus.PROCESSING ? (
              <PayoutProcessingElapsed fromUnix={row.start_at} warnAfterSec={180} critAfterSec={600} />
            ) : (
              <span className="text-text-muted">—</span>
            ),
        },
      ]
    : [];

  const tail = [
    {
      key: 'currency',
      header: t('colCurrency'),
      className: 'text-center',
      render: (row: PayOutOrderCabinetDto) => (
        <span className="text-text-secondary">{row.currency}</span>
      ),
    },
    {
      key: 'recipient',
      header: t('colRecipient'),
      render: (row: PayOutOrderCabinetDto) => (
        <div className="flex flex-col">
          <PayoutRecipientNumberCopyCell
            number={row.details.number}
            copyLabel={t('detail.recipientNumber')}
          />
          {row.details.owner && (
            <span className="text-xs text-text-muted">{row.details.owner}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('colStatus'),
      className: 'text-center',
      mobilePrimary: true,
      render: (row: PayOutOrderCabinetDto) => (
        <PayoutStatusWithHistory row={row} statusHistoryPath={statusHistoryPath} t={t} />
      ),
    },
    {
      key: 'created_at',
      header: t('colCreated'),
      render: (row: PayOutOrderCabinetDto) => (
        <span className="text-text-muted text-sm">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: t('colAction'),
      className: 'text-end',
      render: (row: PayOutOrderCabinetDto) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <TraderPayoutWorkflowActions
            key={`payout-actions-${row.id}`}
            order={row}
            processMutation={processMutation}
            completeMutation={completeMutation}
            cancelMutation={cancelMutation}
            rejectMutation={rejectMutation}
            attachCompletionProofMutation={attachCompletionProofMutation}
            detachCompletionProofMutation={detachCompletionProofMutation}
            layout="cell"
          />
          <IconButton label={t('viewOrderDetails')} onClick={() => onView(row)}>
            <Eye className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return [idCol, amountCol, ...specialistMid, ...tail];
}

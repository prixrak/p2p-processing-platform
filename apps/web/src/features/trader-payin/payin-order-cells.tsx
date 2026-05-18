'use client';

import { useEffect, useState } from 'react';
import { FileText, Scale, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayinOrderStatusBadge } from '@/components/ui/order-status-badge';
import { AppealStatus, PayInOrderStatus } from '@p2p/shared';
import type { TraderPayInOrderDto } from '@p2p/shared';
import { cn } from '@/lib/utils';
import { orderPayinProofFileIds } from './payin-finalize-utils';
import { payinDeadlineElapsedShowsCanceled } from './payin-countdown-utils';

type CountdownUrgency = 'canceled' | 'critical' | 'low' | 'moderate' | 'comfortable';

function computeUrgency(
  remainingMs: number,
  createdAt: number | null | undefined,
  autocloseAt: number | null,
): Exclude<CountdownUrgency, 'canceled'> {
  if (!autocloseAt || remainingMs <= 0) return 'critical';

  const windowSec =
    createdAt != null && autocloseAt > createdAt ? autocloseAt - createdAt : null;
  if (windowSec != null && windowSec > 10) {
    const totalMs = windowSec * 1000;
    const ratio = remainingMs / totalMs;
    if (ratio > 0.45) return 'comfortable';
    if (ratio > 0.2) return 'moderate';
    if (ratio > 0.08) return 'low';
    return 'critical';
  }

  if (remainingMs > 300_000) return 'comfortable';
  if (remainingMs > 120_000) return 'moderate';
  if (remainingMs > 45_000) return 'low';
  return 'critical';
}

const urgencyClass: Record<CountdownUrgency, string> = {
  comfortable:
    'border-accent-green/35 bg-accent-green/10 text-accent-green shadow-[0_0_0_1px_rgba(34,197,94,0.12)]',
  moderate:
    'border-accent-yellow/40 bg-accent-yellow/10 text-accent-yellow shadow-[0_0_0_1px_rgba(245,158,11,0.12)]',
  low: 'border-orange-400/45 bg-orange-400/12 text-orange-300 shadow-[0_0_0_1px_rgba(251,146,60,0.15)]',
  critical:
    'border-accent-red/55 bg-accent-red/15 text-accent-red shadow-[0_0_0_1px_rgba(239,68,68,0.2)]',
  canceled:
    'border-accent-red/50 bg-accent-red/12 text-accent-red shadow-[0_0_0_1px_rgba(239,68,68,0.25)]',
};

export function CountdownTimer({
  autocloseAt,
  createdAt,
  status,
  clockOffsetMs = 0,
}: {
  autocloseAt: number | null;
  /** When set with `autocloseAt`, remaining time is colored relative to the full window. */
  createdAt?: number | null;
  status?: PayInOrderStatus;
  /** Matches API deadline (`autocloseAt`) to server time via the response `Date` header. */
  clockOffsetMs?: number;
}) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (autocloseAt == null || autocloseAt <= 0) return;
    const deadlineMs = autocloseAt * 1000;

    function update() {
      const adjustedNow = Date.now() + clockOffsetMs;
      setRemainingMs(deadlineMs - adjustedNow);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [autocloseAt, clockOffsetMs]);

  if (!autocloseAt) return <span className="text-text-muted">-</span>;

  const displayRemainingMs = Math.max(0, remainingMs);
  const showCanceled = payinDeadlineElapsedShowsCanceled(status);
  const minutes = Math.floor(displayRemainingMs / 60000);
  const seconds = Math.floor((displayRemainingMs % 60000) / 1000);
  const urgency: CountdownUrgency = showCanceled
    ? 'canceled'
    : displayRemainingMs <= 0
      ? 'critical'
      : computeUrgency(displayRemainingMs, createdAt, autocloseAt);

  /** Past `autoclose_at` while still active: slightly stronger than “critical”, without heavy glow. */
  const overdueActive = !showCanceled && displayRemainingMs <= 0;

  return (
    <span
      className={cn(
        'inline-flex min-w-[4.25rem] justify-end rounded-md border px-2 py-0.5 font-mono text-sm font-semibold tabular-nums transition-colors duration-500',
        overdueActive
          ? 'border border-red-400/55 bg-red-950/25 !text-red-400/90'
          : urgencyClass[urgency],
      )}
      title={overdueActive ? 'Payment deadline passed — resolve or cancel explicitly' : undefined}
    >
      {showCanceled ? 'Canceled' : `${minutes}:${seconds.toString().padStart(2, '0')}`}
    </span>
  );
}

export function CopyOrderIdCell({ id }: { id: string }) {
  return <OrderIdCopyCell id={id} withToast />;
}

function AppealInlineSummary({
  row,
  shortLabels,
}: {
  row: TraderPayInOrderDto;
  /** Shorter copy when this is the only status badge (order status is already `APPEAL`). */
  shortLabels: boolean;
}) {
  const appeals = row.appeals ?? [];
  if (appeals.length === 0) {
    if (row.status === PayInOrderStatus.APPEAL) {
      return (
        <Badge
          variant="warning"
          className="max-w-full shrink truncate px-2 py-px text-[11px]"
          leadingIcon={<Scale strokeWidth={2} />}
        >
          {shortLabels ? 'Pending' : 'Appeal pending'}
        </Badge>
      );
    }
    return null;
  }

  const open = appeals.filter((a) => a.status === AppealStatus.OPEN);
  const rejected = appeals.some((a) => a.status === AppealStatus.REJECTED);
  if (open.length > 0) {
    return (
      <Badge
        variant="warning"
        className="max-w-full shrink truncate px-2 py-px text-[11px]"
        leadingIcon={<Scale strokeWidth={2} />}
      >
        {shortLabels
          ? `Open${open.length > 1 ? ` (${open.length})` : ''}`
          : `Appeal open${open.length > 1 ? ` (${open.length})` : ''}`}
      </Badge>
    );
  }
  if (rejected) {
    return (
      <Badge
        variant="danger"
        className="max-w-full shrink truncate px-2 py-px text-[11px]"
        leadingIcon={<XCircle strokeWidth={2} />}
      >
        {shortLabels ? 'Rejected' : 'Appeal rejected'}
      </Badge>
    );
  }
  return (
    <Badge
      variant="success"
      className="max-w-full shrink truncate px-2 py-px text-[11px]"
      leadingIcon={<CheckCircle2 strokeWidth={2} />}
    >
      {shortLabels ? 'Resolved' : 'Appeal resolved'}
    </Badge>
  );
}

/** Status column: order + appeal badges (deduped), optional receipt icon. */
export function PayInOrderStatusColumnCell({
  row,
  onOpenReceipts,
}: {
  row: TraderPayInOrderDto;
  onOpenReceipts: (row: TraderPayInOrderDto) => void;
}) {
  const proofIds = orderPayinProofFileIds(row);
  const proofCount = proofIds.length;
  const hasProofs = proofCount > 0;

  /** Avoid two badges both reading “Appeal …” when order status is already `APPEAL`. */
  const appealCarriesPrimaryStatus = row.status === PayInOrderStatus.APPEAL;

  return (
    <div className="flex max-w-full flex-row flex-nowrap items-center justify-center gap-1 py-0.5">
      <span className="inline-flex min-w-0 max-w-full flex-row flex-nowrap items-center justify-center gap-1">
        {!appealCarriesPrimaryStatus && <PayinOrderStatusBadge status={row.status} />}
        <AppealInlineSummary row={row} shortLabels={appealCarriesPrimaryStatus} />
      </span>
      {hasProofs ? (
        <IconButton
          label={`View payment proofs (${proofCount})`}
          tooltipWide
          variant="ghost"
          className="!min-h-8 !min-w-8 shrink-0 !p-1.5 text-text-primary hover:bg-bg-hover"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReceipts(row);
          }}
        >
          <FileText className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      ) : null}
    </div>
  );
}

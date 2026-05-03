'use client';

import { useEffect, useState } from 'react';
import { Copy, Scale, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { AppealStatus, PayInOrderStatus } from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';
import { shortId, cn } from '@/lib/utils';

type CountdownUrgency = 'expired' | 'critical' | 'low' | 'moderate' | 'comfortable';

function computeUrgency(
  remainingMs: number,
  createdAt: number | null | undefined,
  autocloseAt: number | null,
): CountdownUrgency {
  if (!autocloseAt || remainingMs <= 0) return 'expired';

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
  expired:
    'border-accent-red/50 bg-accent-red/12 text-accent-red shadow-[0_0_0_1px_rgba(239,68,68,0.25)]',
};

export function CountdownTimer({
  autocloseAt,
  createdAt,
}: {
  autocloseAt: number | null;
  /** When set with `autocloseAt`, remaining time is colored relative to the full window. */
  createdAt?: number | null;
}) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (autocloseAt == null || autocloseAt <= 0) return;
    const deadlineMs = autocloseAt * 1000;

    function update() {
      const diff = deadlineMs - Date.now();
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
  const urgency = isExpired ? 'expired' : computeUrgency(remaining, createdAt, autocloseAt);

  return (
    <span
      className={cn(
        'inline-flex min-w-[4.25rem] justify-end rounded-md border px-2 py-0.5 font-mono text-sm font-semibold tabular-nums transition-colors duration-500',
        urgencyClass[urgency],
      )}
    >
      {isExpired ? 'EXPIRED' : `${minutes}:${seconds.toString().padStart(2, '0')}`}
    </span>
  );
}

export function CopyOrderIdCell({ id }: { id: string }) {
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
      <Copy className={cn('h-4 w-4 shrink-0 text-text-muted', copied && 'text-accent-green')} />
    </button>
  );
}

export function AppealCell({ row }: { row: OrderDto }) {
  const appeals = row.appeals ?? [];
  if (appeals.length === 0) {
    if (row.status === PayInOrderStatus.APPEAL) {
      return (
        <Badge variant="warning" leadingIcon={<Scale strokeWidth={2} />}>
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
      <Badge variant="warning" leadingIcon={<Scale strokeWidth={2} />}>
        Open{open.length > 1 ? ` (${open.length})` : ''}
      </Badge>
    );
  }
  if (rejected) {
    return (
      <Badge variant="danger" leadingIcon={<XCircle strokeWidth={2} />}>
        Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="success" leadingIcon={<CheckCircle2 strokeWidth={2} />}>
      Resolved
    </Badge>
  );
}

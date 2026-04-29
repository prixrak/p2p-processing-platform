'use client';

import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { AppealStatus, PayInOrderStatus } from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';
import { shortId, cn } from '@/lib/utils';

export function CountdownTimer({ autocloseAt }: { autocloseAt: number | null }) {
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
      <Copy className={cn('h-3.5 w-3.5 shrink-0 text-text-muted', copied && 'text-accent-green')} />
    </button>
  );
}

export function AppealCell({ row }: { row: OrderDto }) {
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

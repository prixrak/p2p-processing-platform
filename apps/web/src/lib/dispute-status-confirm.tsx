import type { PendingConfirmCopy } from '@/components/ui/pending-confirm-dialog';

export type PendingDisputeStatusChange = {
  id: string;
  status: 'IN_PROGRESS' | 'RESOLVED';
  orderId: string;
};

const STATUS_LABELS: Record<PendingDisputeStatusChange['status'], string> = {
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export function disputeStatusConfirmCopy(
  pending: PendingDisputeStatusChange,
): PendingConfirmCopy {
  const statusLabel = STATUS_LABELS[pending.status];

  return {
    title: 'Change dispute status?',
    description: (
      <>
        Dispute for order{' '}
        <span className="font-mono text-text-primary">{pending.orderId.slice(0, 12)}…</span> will be
        marked <span className="font-medium text-text-primary">{statusLabel}</span>.
      </>
    ),
    confirmLabel: `Mark ${statusLabel}`,
    tone: pending.status === 'RESOLVED' ? 'default' : 'default',
  };
}

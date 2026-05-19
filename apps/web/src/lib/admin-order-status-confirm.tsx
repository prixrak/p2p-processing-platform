import type { PendingConfirmCopy } from '@/components/ui/pending-confirm-dialog';
import { payinStatusLabel, payoutStatusLabel } from '@/lib/order-status-ui';

export type PendingAdminOrderStatusChange = {
  id: string;
  status: string;
  orderType: 'PAYIN' | 'PAYOUT';
  amount: number;
  currency: string;
};

const DESTRUCTIVE_STATUSES = new Set(['CANCELED', 'FAILED', 'UPLOAD_FAILED']);

export function adminOrderStatusConfirmCopy(
  pending: PendingAdminOrderStatusChange,
): PendingConfirmCopy {
  const statusLabel =
    pending.orderType === 'PAYOUT'
      ? payoutStatusLabel(pending.status)
      : payinStatusLabel(pending.status);

  return {
    title: 'Change order status?',
    description: (
      <>
        Order{' '}
        <span className="font-mono text-text-primary">{pending.id.slice(0, 12)}…</span> will move to{' '}
        <span className="font-medium text-text-primary">{statusLabel}</span>. Amount{' '}
        <span className="font-mono tabular-nums">
          {pending.amount.toLocaleString()} {pending.currency}
        </span>
        .
      </>
    ),
    confirmLabel: `Set to ${statusLabel}`,
    tone: DESTRUCTIVE_STATUSES.has(pending.status) ? 'danger' : 'default',
  };
}

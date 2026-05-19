import { AppealStatus } from '@p2p/shared';
import type { PendingConfirmCopy } from '@/components/ui/pending-confirm-dialog';

export type PendingAppealDecision = {
  appealId: string;
  decision: AppealStatus;
  /** Order total — used as placeholder when accepting (resolved). */
  orderAmount: number;
  /** Payer-reported amount to pre-fill (resolved only). */
  defaultPaidAmount?: number;
};

export function appealDecisionConfirmCopy(
  pending: PendingAppealDecision,
  labels: {
    title: string;
    rejectDescription: string;
    acceptDescription: string;
    rejectLabel: string;
    acceptLabel: string;
    cancelLabel: string;
  },
): PendingConfirmCopy {
  const isReject = pending.decision === AppealStatus.REJECTED;

  return {
    title: labels.title,
    description: isReject ? labels.rejectDescription : labels.acceptDescription,
    confirmLabel: isReject ? labels.rejectLabel : labels.acceptLabel,
    tone: isReject ? 'danger' : 'default',
    cancelLabel: labels.cancelLabel,
  };
}

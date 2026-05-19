'use client';

import { useEffect, useState } from 'react';
import { AppealStatus } from '@p2p/shared';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  appealDecisionConfirmCopy,
  type PendingAppealDecision,
} from '@/lib/appeal-decision-confirm';
import { parsePositiveAmount } from '@/features/trader-payin/payin-finalize-utils';

export type AppealDecisionConfirmPayload = {
  appealId: string;
  decision: AppealStatus;
  actualAmount?: number;
};

export function AppealDecisionConfirmDialog({
  pending,
  onOpenChange,
  labels,
  amountLabels,
  loading,
  onConfirm,
}: {
  pending: PendingAppealDecision | null;
  onOpenChange: (open: boolean) => void;
  labels: Parameters<typeof appealDecisionConfirmCopy>[1];
  amountLabels: { label: string; hint: string };
  loading?: boolean;
  onConfirm: (payload: AppealDecisionConfirmPayload) => void;
}) {
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    if (!pending) {
      setAmountInput('');
      return;
    }
    if (pending.decision === AppealStatus.RESOLVED) {
      setAmountInput(
        pending.defaultPaidAmount != null ? String(pending.defaultPaidAmount) : '',
      );
    } else {
      setAmountInput('');
    }
  }, [pending?.appealId, pending?.decision, pending?.defaultPaidAmount]);

  const isResolved = pending?.decision === AppealStatus.RESOLVED;
  const parsedAmount = isResolved ? parsePositiveAmount(amountInput) : null;
  const trimmedInput = amountInput.replace(',', '.').trim();
  const amountInvalid = isResolved && trimmedInput.length > 0 && parsedAmount === null;
  const copy = pending ? appealDecisionConfirmCopy(pending, labels) : null;

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onOpenChange(false);
      }}
      title={copy?.title ?? ''}
      description={copy?.description}
      confirmLabel={copy?.confirmLabel ?? 'Confirm'}
      cancelLabel={copy?.cancelLabel ?? 'Cancel'}
      tone={copy?.tone ?? 'default'}
      loading={loading}
      confirmDisabled={amountInvalid}
      onConfirm={() => {
        if (!pending) return;
        const payload: AppealDecisionConfirmPayload = {
          appealId: pending.appealId,
          decision: pending.decision,
        };
        if (pending.decision === AppealStatus.RESOLVED && parsedAmount !== null) {
          payload.actualAmount = parsedAmount;
        }
        onConfirm(payload);
      }}
    >
      {isResolved && pending ? (
        <ResolvedAmountField
          orderAmount={pending.orderAmount}
          amountLabels={amountLabels}
          amountInput={amountInput}
          onAmountInputChange={setAmountInput}
        />
      ) : null}
    </ConfirmDialog>
  );
}

function ResolvedAmountField({
  orderAmount,
  amountLabels,
  amountInput,
  onAmountInputChange,
}: {
  orderAmount: number;
  amountLabels: { label: string; hint: string };
  amountInput: string;
  onAmountInputChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor="appeal-resolve-amount"
        className="mb-1.5 block text-xs font-medium text-text-muted"
      >
        {amountLabels.label}
      </label>
      <input
        id="appeal-resolve-amount"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={String(orderAmount)}
        value={amountInput}
        onChange={(e) => onAmountInputChange(e.target.value)}
        className="w-full rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
      />
      <p className="mt-1.5 text-xs text-text-muted">{amountLabels.hint}</p>
    </div>
  );
}

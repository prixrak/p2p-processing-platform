'use client';

import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn, formatCurrency } from '@/lib/utils';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  maskRequisite,
  parsePositiveAmount,
  finalizePreviewTone,
  finalizeTargetPreview,
} from './payin-finalize-utils';
import type { FinalizeDialogState } from './payin-types';

export function PayInFinalizeConfirmationModal({
  finalizeDialog,
  onClose,
  setFinalizeDialog,
  onApply,
  confirmMutation,
  cancelMutation,
}: {
  finalizeDialog: FinalizeDialogState | null;
  onClose: () => void;
  setFinalizeDialog: Dispatch<SetStateAction<FinalizeDialogState | null>>;
  onApply: () => void;
  confirmMutation: UseMutationResult<
    unknown,
    unknown,
    { orderId: string; actualAmount?: number }
  >;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
}) {
  return (
    <Modal open={finalizeDialog !== null} onClose={onClose} title="Are you sure?" size="sm">
      {finalizeDialog && (
        <>
          <div className="-mt-2 flex justify-center pb-3">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-warning/35 text-warning"
              aria-hidden
            >
              <AlertTriangle className="h-7 w-7" />
            </div>
          </div>

          {finalizeDialog.kind === 'adjustment' && (
            <div className="mb-4">
              <label
                htmlFor="finalize-adjustment-amount"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Actual amount received
              </label>
              <input
                id="finalize-adjustment-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={String(finalizeDialog.order.amount)}
                value={finalizeDialog.adjustmentInput}
                onChange={(e) =>
                  setFinalizeDialog((prev) =>
                    prev ? { ...prev, adjustmentInput: e.target.value } : prev,
                  )
                }
                className="w-full rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Use when the received amount differs from the order total. Leave other choices for
                exact matches.
              </p>
            </div>
          )}

          {(() => {
            const fd = finalizeDialog;
            const adjParsed =
              fd.kind === 'adjustment' ? parsePositiveAmount(fd.adjustmentInput) : null;
            const statusPreviewArg = fd.kind === 'adjustment' ? adjParsed ?? undefined : undefined;

            const statusWords = finalizeTargetPreview(fd.order, fd.kind, statusPreviewArg);
            const applyLoading =
              (confirmMutation.isPending && confirmMutation.variables?.orderId === fd.order.id) ||
              (cancelMutation.isPending && cancelMutation.variables === fd.order.id);
            const applyDisabled =
              fd.kind === 'adjustment' &&
              (adjParsed === null || adjParsed === Number(fd.order.amount));

            return (
              <>
                <div className="divide-y divide-border-primary rounded-lg border border-border-primary">
                  <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="shrink-0 text-xs text-text-muted">Status will change to</span>
                    <span
                      className={cn(
                        'text-sm font-semibold sm:text-end',
                        finalizePreviewTone(fd.order, fd.kind, fd.adjustmentInput),
                      )}
                    >
                      {statusWords}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="shrink-0 text-xs text-text-muted">Account / requisite</span>
                    <span className="break-all font-mono text-xs text-text-primary sm:text-end">
                      {maskRequisite(fd.order.requisite_number ?? fd.order.payment_detail?.number)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="shrink-0 text-xs text-text-muted">Order amount</span>
                    <span className="text-sm font-medium text-accent-green sm:text-end">
                      {formatCurrency(fd.order.amount, fd.order.currency)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="shrink-0 text-xs text-text-muted">Owner</span>
                    <span className="break-all font-mono text-xs text-text-primary sm:text-end">
                      {fd.order.requisite_owner || fd.order.payment_detail?.owner || '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="shrink-0 text-xs text-text-muted">Card holder name</span>
                    <span className="break-all text-xs text-text-primary sm:text-end">
                      {fd.order.requisite_card_holder_name ||
                        fd.order.payment_detail?.card_holder_name ||
                        '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="flex-1"
                    loading={applyLoading}
                    disabled={applyDisabled}
                    onClick={onApply}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    disabled={applyLoading}
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            );
          })()}
        </>
      )}
    </Modal>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Modal } from '@/components/ui/modal';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import { formatDateFull } from '@/lib/utils';
import { internalPaths } from '@/lib/internal-api';
import { DetailRow } from '@/components/ui/detail-row';
import type { PayoutCompleteVars } from './trader-payout-columns';
import {
  TraderPayoutWorkflowActions,
  type PayoutRejectVars,
} from './trader-payout-workflow-actions';
import { TraderPayoutTakeFromPoolButton } from './trader-payout-take-from-pool-button';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { payoutCompletionProofFileIds } from './payout-completion-proof-ids';
import {
  PayoutAmountCopyCell,
  PayoutPoolCloseCountdown,
  PayoutProcessingElapsed,
  PayoutRecipientNumberCopyCell,
} from './trader-payout-columns';

export type TraderPayoutDetailVariant = 'standard' | 'specialist';

export function TraderPayoutOrderDetailModal({
  selectedOrder,
  onClose,
  variant = 'standard',
  takeFromPoolMutation,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
  attachCompletionProofMutation,
  detachCompletionProofMutation,
}: {
  selectedOrder: PayOutOrderCabinetDto | null;
  onClose: () => void;
  variant?: TraderPayoutDetailVariant;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
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
}) {
  const t = useTranslations('Trader.Payout.detail');
  const tTable = useTranslations('Trader.Payout');
  const isSpecialist = variant === 'specialist';
  const showRecipient = selectedOrder?.requisites_visible !== false;

  return (
    <Modal open={!!selectedOrder} onClose={onClose} title={t('modalTitle')} size="lg">
      {selectedOrder && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label={tTable('colId')} value={selectedOrder.id} mono />
            <DetailRow label={tTable('colAmount')}>
              <PayoutAmountCopyCell
                amount={selectedOrder.amount}
                currency={selectedOrder.currency}
                copyLabel={tTable('colAmount')}
                className="text-sm font-semibold text-text-primary tabular-nums"
              />
            </DetailRow>
            {isSpecialist && (
              <DetailRow
                label={tTable('colUsdtEstimate')}
                value={
                  selectedOrder.amount_usdt_estimate != null
                    ? selectedOrder.amount_usdt_estimate.toFixed(2)
                    : '—'
                }
              />
            )}
            {isSpecialist && showRecipient && (
              <DetailRow
                label={tTable('colMethod')}
                value={selectedOrder.payment_method_name ?? '—'}
              />
            )}
            {isSpecialist && showRecipient && (
              <DetailRow label={tTable('colActive')}>
                {selectedOrder.status === PayOutOrderStatus.PROCESSING ? (
                  <PayoutProcessingElapsed
                    fromUnix={selectedOrder.start_at}
                    warnAfterSec={180}
                    critAfterSec={600}
                  />
                ) : (
                  '—'
                )}
              </DetailRow>
            )}
            <DetailRow label={tTable('colCurrency')} value={selectedOrder.currency} />
            {showRecipient && (
              <>
                <DetailRow label={t('recipientNumber')}>
                  <PayoutRecipientNumberCopyCell
                    number={selectedOrder.details.number}
                    copyLabel={t('recipientNumber')}
                  />
                </DetailRow>
                <DetailRow
                  label={t('recipientOwner')}
                  value={selectedOrder.details.owner ?? '—'}
                />
              </>
            )}
            <DetailRow label={tTable('colStatus')}>
              <PayoutOrderStatusBadge status={selectedOrder.status} />
            </DetailRow>
            {!showRecipient && selectedOrder.pool_close_deadline_at != null && (
              <DetailRow label={tTable('colTimeToClose')}>
                <PayoutPoolCloseCountdown untilUnix={selectedOrder.pool_close_deadline_at} />
              </DetailRow>
            )}
            <DetailRow
              label={tTable('colCreated')}
              value={formatDateFull(selectedOrder.created_at)}
            />
          </div>

          {payoutCompletionProofFileIds(selectedOrder).length > 0 && (
            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">{t('completionProof')}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {payoutCompletionProofFileIds(selectedOrder).map((fileId) => (
                  <AuthorizedFilePreview
                    key={fileId}
                    path={internalPaths.fileById(fileId)}
                    alt={t('proofAlt')}
                    className="max-h-80"
                  />
                ))}
              </div>
            </div>
          )}

          {!showRecipient && (
            <p className="text-sm text-text-secondary">{t('recipientHiddenHint')}</p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {selectedOrder.status === PayOutOrderStatus.PENDING && (
              <TraderPayoutTakeFromPoolButton
                layout="toolbar"
                order={selectedOrder}
                takeFromPoolMutation={takeFromPoolMutation}
                onConfirmed={onClose}
              />
            )}
            {(selectedOrder.status === PayOutOrderStatus.NEW ||
              selectedOrder.status === PayOutOrderStatus.PROCESSING ||
              selectedOrder.status === PayOutOrderStatus.COMPLETED) && (
              <TraderPayoutWorkflowActions
                key={`payout-actions-${selectedOrder.id}`}
                order={selectedOrder}
                processMutation={processMutation}
                completeMutation={completeMutation}
                cancelMutation={cancelMutation}
                rejectMutation={rejectMutation}
                attachCompletionProofMutation={attachCompletionProofMutation}
                detachCompletionProofMutation={detachCompletionProofMutation}
                layout="toolbar"
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

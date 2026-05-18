'use client';

import { useTranslations } from 'next-intl';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Modal } from '@/components/ui/modal';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
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

export function TraderPayoutOrderDetailModal({
  selectedOrder,
  onClose,
  takeFromPoolMutation,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
  attachCompletionProofMutation,
  detachCompletionProofMutation,
}: {
  selectedOrder: PayOutOrderApiDto | null;
  onClose: () => void;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  attachCompletionProofMutation?: UseMutationResult<
    PayOutOrderApiDto,
    unknown,
    { orderId: string; fileIds: string[] }
  >;
  detachCompletionProofMutation?: UseMutationResult<
    PayOutOrderApiDto,
    unknown,
    { orderId: string; fileId: string }
  >;
}) {
  const t = useTranslations('Trader.Payout.detail');
  const showFullOrderMeta = selectedOrder?.requisites_visible !== false;

  return (
    <Modal open={!!selectedOrder} onClose={onClose} title={t('modalTitle')} size="lg">
      {selectedOrder && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label={t('orderId')} value={selectedOrder.id} mono />
            {showFullOrderMeta && (
              <DetailRow label={t('requestId')} value={selectedOrder.request_id} mono />
            )}
            <DetailRow
              label={t('amount')}
              value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
            />
            <DetailRow label={t('currency')} value={selectedOrder.currency} />
            <DetailRow label={t('status')}>
              <PayoutOrderStatusBadge status={selectedOrder.status} />
            </DetailRow>
            {selectedOrder.pool_close_deadline_at != null && (
              <DetailRow
                label={t('poolDeadline')}
                value={formatDateFull(selectedOrder.pool_close_deadline_at)}
              />
            )}
            {showFullOrderMeta && (
              <>
                <DetailRow label={t('rate')} value={String(selectedOrder.rate)} />
                <DetailRow label={t('partnerAmount')} value={String(selectedOrder.partner_amount)} />
                <DetailRow label={t('fee')} value={`${selectedOrder.percent_fee}%`} />
              </>
            )}
            <DetailRow label={t('created')} value={formatDateFull(selectedOrder.created_at)} />
            {showFullOrderMeta && selectedOrder.start_at != null && (
              <DetailRow label={t('started')} value={formatDateFull(selectedOrder.start_at)} />
            )}
            {showFullOrderMeta && selectedOrder.end_at != null && (
              <DetailRow label={t('completed')} value={formatDateFull(selectedOrder.end_at)} />
            )}
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

          {!showFullOrderMeta && (
            <p className="text-sm text-text-secondary">{t('recipientHiddenHint')}</p>
          )}

          {showFullOrderMeta && (
            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">{t('recipientSection')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label={t('recipientType')} value={selectedOrder.details.type} />
                <DetailRow label={t('recipientNumber')} value={selectedOrder.details.number} mono />
                <DetailRow label={t('recipientOwner')} value={selectedOrder.details.owner ?? '-'} />
                <DetailRow label={t('recipientCode')} value={selectedOrder.details.code ?? '-'} />
              </div>
            </div>
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

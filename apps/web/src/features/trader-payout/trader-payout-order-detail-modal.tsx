'use client';

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
  const showFullOrderMeta = selectedOrder?.requisites_visible !== false;

  return (
    <Modal
      open={!!selectedOrder}
      onClose={onClose}
      title="Pay-Out Order Details"
      size="lg"
    >
      {selectedOrder && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Order ID" value={selectedOrder.id} mono />
            {showFullOrderMeta && (
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
            )}
            <DetailRow
              label="Amount"
              value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
            />
            <DetailRow label="Currency" value={selectedOrder.currency} />
            <DetailRow label="Status">
              <PayoutOrderStatusBadge status={selectedOrder.status} />
            </DetailRow>
            {selectedOrder.pool_close_deadline_at != null && (
              <DetailRow
                label="Pool deadline"
                value={formatDateFull(selectedOrder.pool_close_deadline_at)}
              />
            )}
            {showFullOrderMeta && (
              <>
                <DetailRow label="Rate" value={String(selectedOrder.rate)} />
                <DetailRow label="Partner Amount" value={String(selectedOrder.partner_amount)} />
                <DetailRow label="Fee" value={`${selectedOrder.percent_fee}%`} />
              </>
            )}
            <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
            {showFullOrderMeta && selectedOrder.start_at != null && (
              <DetailRow label="Started" value={formatDateFull(selectedOrder.start_at)} />
            )}
            {showFullOrderMeta && selectedOrder.end_at != null && (
              <DetailRow label="Completed" value={formatDateFull(selectedOrder.end_at)} />
            )}
          </div>

          {/* Not gated on `requisites_visible`: pool rows hide requisites but may still carry a proof id after assign/sync. */}
          {payoutCompletionProofFileIds(selectedOrder).length > 0 && (
            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Completion proof</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {payoutCompletionProofFileIds(selectedOrder).map((fileId) => (
                  <AuthorizedFilePreview
                    key={fileId}
                    path={internalPaths.fileById(fileId)}
                    alt="Pay-out completion proof"
                    className="max-h-80"
                  />
                ))}
              </div>
            </div>
          )}

          {!showFullOrderMeta && (
            <p className="text-sm text-text-secondary">
              Recipient requisites and owner data are available after you take this order from the pool.
            </p>
          )}

          {showFullOrderMeta && (
            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Recipient Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Type" value={selectedOrder.details.type} />
                <DetailRow label="Number" value={selectedOrder.details.number} mono />
                <DetailRow label="Owner" value={selectedOrder.details.owner ?? '-'} />
                <DetailRow label="Code" value={selectedOrder.details.code ?? '-'} />
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

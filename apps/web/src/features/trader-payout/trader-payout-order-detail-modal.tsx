'use client';

import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Modal } from '@/components/ui/modal';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { internalPaths } from '@/lib/internal-api';
import { PayoutDetailRow } from './payout-detail-row';
import type { PayoutCompleteVars } from './trader-payout-columns';
import {
  TraderPayoutWorkflowActions,
  type PayoutRejectVars,
} from './trader-payout-workflow-actions';
import { TraderPayoutTakeFromPoolButton } from './trader-payout-take-from-pool-button';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';

export function TraderPayoutOrderDetailModal({
  selectedOrder,
  onClose,
  takeFromPoolMutation,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
  attachCompletionProofMutation,
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
            <PayoutDetailRow label="Order ID" value={selectedOrder.id} mono />
            {showFullOrderMeta && (
              <PayoutDetailRow label="Request ID" value={selectedOrder.request_id} mono />
            )}
            <PayoutDetailRow
              label="Amount"
              value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
            />
            <PayoutDetailRow label="Currency" value={selectedOrder.currency} />
            <PayoutDetailRow label="Status">
              <PayoutOrderStatusBadge status={selectedOrder.status} />
            </PayoutDetailRow>
            {selectedOrder.pool_close_deadline_at != null && (
              <PayoutDetailRow
                label="Pool deadline"
                value={formatDateFull(selectedOrder.pool_close_deadline_at)}
              />
            )}
            {showFullOrderMeta && (
              <>
                <PayoutDetailRow label="Rate" value={String(selectedOrder.rate)} />
                <PayoutDetailRow label="Partner Amount" value={String(selectedOrder.partner_amount)} />
                <PayoutDetailRow label="Fee" value={`${selectedOrder.percent_fee}%`} />
              </>
            )}
            <PayoutDetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
            {showFullOrderMeta && selectedOrder.start_at != null && (
              <PayoutDetailRow label="Started" value={formatDateFull(selectedOrder.start_at)} />
            )}
            {showFullOrderMeta && selectedOrder.end_at != null && (
              <PayoutDetailRow label="Completed" value={formatDateFull(selectedOrder.end_at)} />
            )}
          </div>

          {/* Not gated on `requisites_visible`: pool rows hide requisites but may still carry a proof id after assign/sync. */}
          {selectedOrder.completion_proof_file_id != null && (
            <div className="rounded-lg border border-border-primary p-4">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">Completion proof</h3>
              <AuthorizedFilePreview
                path={internalPaths.fileById(selectedOrder.completion_proof_file_id)}
                alt="Pay-out completion proof"
                className="max-h-80"
              />
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
                <PayoutDetailRow label="Type" value={selectedOrder.details.type} />
                <PayoutDetailRow label="Number" value={selectedOrder.details.number} mono />
                <PayoutDetailRow label="Owner" value={selectedOrder.details.owner ?? '-'} />
                <PayoutDetailRow label="Code" value={selectedOrder.details.code ?? '-'} />
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
              (selectedOrder.status === PayOutOrderStatus.COMPLETED && attachCompletionProofMutation)) && (
              <TraderPayoutWorkflowActions
                order={selectedOrder}
                processMutation={processMutation}
                completeMutation={completeMutation}
                cancelMutation={cancelMutation}
                rejectMutation={rejectMutation}
                attachCompletionProofMutation={attachCompletionProofMutation}
                layout="toolbar"
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

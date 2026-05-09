'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PayoutOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Modal } from '@/components/ui/modal';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { PayoutDetailRow } from './payout-detail-row';
import type { PayoutCompleteVars } from './trader-payout-columns';
import {
  TraderPayoutWorkflowActions,
  type PayoutRejectVars,
} from './trader-payout-workflow-actions';

export function TraderPayoutOrderDetailModal({
  variant = 'standard',
  selectedOrder,
  onClose,
  takeFromPoolMutation,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
}: {
  variant?: 'standard' | 'specialist';
  selectedOrder: PayOutOrderApiDto | null;
  onClose: () => void;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
}) {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const isSpecialist = variant === 'specialist';
  const showFullOrderMeta = selectedOrder?.requisites_visible !== false;

  return (
    <Modal
      open={!!selectedOrder}
      onClose={() => {
        setProofFile(null);
        onClose();
      }}
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
            {showFullOrderMeta && selectedOrder.completion_proof_file_id != null && (
              <PayoutDetailRow
                label="Completion proof file"
                value={selectedOrder.completion_proof_file_id}
                mono
              />
            )}
          </div>

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

          {isSpecialist && selectedOrder.status === PayOutOrderStatus.PROCESSING && (
            <div className="rounded-lg border border-border-primary p-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Optional completion proof (image or PDF). Attached when you confirm Mark completed from
                Change status.
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="text-sm text-text-secondary"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {selectedOrder.status === PayOutOrderStatus.PENDING && (
              <Button
                variant="primary"
                onClick={() => {
                  takeFromPoolMutation.mutate(selectedOrder.id);
                  onClose();
                }}
                loading={takeFromPoolMutation.isPending}
              >
                <Play className="h-4 w-4" />
                Take from Pool
              </Button>
            )}
            {(selectedOrder.status === PayOutOrderStatus.NEW ||
              selectedOrder.status === PayOutOrderStatus.PROCESSING) && (
              <TraderPayoutWorkflowActions
                order={selectedOrder}
                processMutation={processMutation}
                completeMutation={completeMutation}
                cancelMutation={cancelMutation}
                rejectMutation={rejectMutation}
                layout="toolbar"
                onCompleteWithProof={
                  isSpecialist
                    ? async () => {
                        let completionProofFileId: string | undefined;
                        if (proofFile) {
                          const fd = new FormData();
                          fd.append('file', proofFile);
                          const meta = await api.upload<{ id: string }>(
                            internalPaths.fileUpload,
                            fd,
                          );
                          completionProofFileId = meta.id;
                        }
                        completeMutation.mutate({
                          orderId: selectedOrder.id,
                          completionProofFileId,
                        });
                      }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

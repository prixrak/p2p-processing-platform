'use client';

import { useState } from 'react';
import { Play, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { payoutStatusVariant } from '@/lib/status-helpers';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { PayoutDetailRow } from './payout-detail-row';
import type { PayoutCompleteVars } from './trader-payout-columns';

export function TraderPayoutOrderDetailModal({
  variant = 'standard',
  selectedOrder,
  onClose,
  takeFromPoolMutation,
  processMutation,
  completeMutation,
  failMutation,
}: {
  variant?: 'standard' | 'specialist';
  selectedOrder: PayOutOrderApiDto | null;
  onClose: () => void;
  takeFromPoolMutation: UseMutationResult<unknown, unknown, string>;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  failMutation: UseMutationResult<unknown, unknown, string>;
}) {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const isSpecialist = variant === 'specialist';

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
            <PayoutDetailRow label="Request ID" value={selectedOrder.request_id} mono />
            <PayoutDetailRow
              label="Amount"
              value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
            />
            <PayoutDetailRow label="Currency" value={selectedOrder.currency} />
            <PayoutDetailRow label="Status">
              <Badge variant={payoutStatusVariant[selectedOrder.status]} dot>
                {selectedOrder.status}
              </Badge>
            </PayoutDetailRow>
            <PayoutDetailRow label="Rate" value={String(selectedOrder.rate)} />
            <PayoutDetailRow label="Partner Amount" value={String(selectedOrder.partner_amount)} />
            <PayoutDetailRow label="Fee" value={`${selectedOrder.percent_fee}%`} />
            <PayoutDetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
            {selectedOrder.start_at && (
              <PayoutDetailRow label="Started" value={formatDateFull(selectedOrder.start_at)} />
            )}
            {selectedOrder.end_at && (
              <PayoutDetailRow label="Completed" value={formatDateFull(selectedOrder.end_at)} />
            )}
            {selectedOrder.completion_proof_file_id && (
              <PayoutDetailRow
                label="Completion proof file"
                value={selectedOrder.completion_proof_file_id}
                mono
              />
            )}
          </div>

          <div className="rounded-lg border border-border-primary p-4">
            <h3 className="mb-3 text-sm font-medium text-text-secondary">Recipient Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <PayoutDetailRow label="Type" value={selectedOrder.details.type} />
              <PayoutDetailRow label="Number" value={selectedOrder.details.number} mono />
              <PayoutDetailRow label="Owner" value={selectedOrder.details.owner ?? '-'} />
              <PayoutDetailRow label="Code" value={selectedOrder.details.code ?? '-'} />
            </div>
          </div>

          {isSpecialist && selectedOrder.status === PayOutOrderStatus.PROCESSING && (
            <div className="rounded-lg border border-border-primary p-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Optional completion proof (image or PDF)
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="text-sm text-text-secondary"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
            {selectedOrder.status === PayOutOrderStatus.NEW && (
              <Button
                variant="primary"
                onClick={() => {
                  processMutation.mutate(selectedOrder.id);
                  onClose();
                }}
                loading={processMutation.isPending}
              >
                <Play className="h-4 w-4" />
                Start Processing
              </Button>
            )}
            {selectedOrder.status === PayOutOrderStatus.PROCESSING && (
              <>
                <Button
                  variant="success"
                  loading={completeMutation.isPending}
                  onClick={async () => {
                    let completionProofFileId: string | undefined;
                    if (isSpecialist && proofFile) {
                      const fd = new FormData();
                      fd.append('file', proofFile);
                      const meta = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
                      completionProofFileId = meta.id;
                    }
                    completeMutation.mutate({
                      orderId: selectedOrder.id,
                      completionProofFileId,
                    });
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Completed
                </Button>
                <Button
                  variant="danger"
                  onClick={() => failMutation.mutate(selectedOrder.id)}
                  loading={failMutation.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Mark Failed
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

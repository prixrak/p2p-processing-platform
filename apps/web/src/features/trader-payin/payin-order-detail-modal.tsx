'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PayinOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { FileUpload } from '@/components/ui/file-upload';
import { ProofThumbnailGrid } from '@/components/ui/proof-thumbnail-grid';
import { PayInOrderStatus, MAX_MULTIPART_FILES_PER_REQUEST } from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/toast';
import { formatErrorMessage } from '@/lib/format-error';
import { payinDirectionLabel } from './payin-finalize-utils';
import {
  OrderFinalizeDropdown,
  type OrderFinalizeMenuState,
} from './order-finalize-dropdown';
import { DetailRow } from '@/components/ui/detail-row';
import type { FinalizeKind } from './payin-types';
import { CountdownTimer } from './payin-order-cells';

function formatPercentPoints(n: number): string {
  const trimmed = Math.round(n * 1e6) / 1e6;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(trimmed)}%`;
}

const FORK_VERIFICATION_STATUSES: PayInOrderStatus[] = [
  PayInOrderStatus.PENDING,
  PayInOrderStatus.NEW,
  PayInOrderStatus.VERIFIED,
];

export function PayInOrderDetailModal({
  selectedOrder,
  clockOffsetMs = 0,
  onClose,
  finalizeMenu,
  setFinalizeMenu,
  onPickFinalizeKind,
}: {
  selectedOrder: OrderDto | null;
  clockOffsetMs?: number;
  onClose: () => void;
  finalizeMenu: OrderFinalizeMenuState;
  setFinalizeMenu: (state: OrderFinalizeMenuState) => void;
  onPickFinalizeKind: (kind: FinalizeKind, order: OrderDto) => void;
}) {
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [forkExchangeRefInput, setForkExchangeRefInput] = useState('');
  const [forkUploadFiles, setForkUploadFiles] = useState<File[]>([]);

  const showForkVerification =
    !!selectedOrder &&
    selectedOrder.trader_processing_method === 'FORK' &&
    FORK_VERIFICATION_STATUSES.includes(selectedOrder.status);

  const forkVerificationMutation = useMutation({
    mutationFn: async (order: OrderDto) => {
      const fd = new FormData();
      fd.append('exchange_reference', forkExchangeRefInput.trim());
      forkUploadFiles.forEach((f) => fd.append('files', f));
      return api.upload<OrderDto>(internalPaths.traderPayinForkVerification(order.id), fd);
    },
    onSuccess: () => {
      setForkUploadFiles([]);
      void queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      toast.success('Exchange verification saved');
    },
    onError: (e: unknown) => {
      toast.error(formatErrorMessage(e));
    },
  });

  return (
    <>
      <Modal open={!!selectedOrder} onClose={onClose} title="Pay-In Order Details" size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Order ID" value={selectedOrder.id} mono />
              <DetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <DetailRow
                label="Amount"
                value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
              />
              <DetailRow label="Currency" value={selectedOrder.currency || '—'} />
              <DetailRow
                label="Merchant fee"
                value={`${formatCurrency(selectedOrder.commission, selectedOrder.currency)} (${formatPercentPoints(selectedOrder.commission_percent)})`}
              />
              <DetailRow
                label="Partner amount"
                value={formatCurrency(selectedOrder.partner_amount, selectedOrder.currency)}
              />
              <DetailRow
                label="Your Pay-In markup"
                value={
                  selectedOrder.payin_trader_markup_percent != null
                    ? formatPercentPoints(selectedOrder.payin_trader_markup_percent)
                    : '—'
                }
              />
              <DetailRow label="Direction" value={payinDirectionLabel(selectedOrder)} />
              {selectedOrder.trader_processing_method ? (
                <DetailRow
                  label="Pay-In routing"
                  value={selectedOrder.trader_processing_method}
                />
              ) : null}
              <DetailRow label="Status">
                <PayinOrderStatusBadge status={selectedOrder.status} />
              </DetailRow>
              <DetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              <DetailRow label="Bank" value={selectedOrder.bank || '-'} />
              <DetailRow label="Requisite" value={selectedOrder.requisite_number || '-'} mono />
              <DetailRow label="Owner" value={selectedOrder.requisite_owner || '-'} />
              <DetailRow label="Time to complete">
                <CountdownTimer
                  autocloseAt={selectedOrder.autoclose_at}
                  createdAt={selectedOrder.created_at}
                  status={selectedOrder.status}
                  clockOffsetMs={clockOffsetMs}
                />
              </DetailRow>
            </div>

            {selectedOrder.trader_processing_method === 'FORK' &&
            (selectedOrder.fork_exchange_reference ||
              (selectedOrder.fork_chat_proof_file_ids?.length ?? 0) > 0) ? (
              <div className="rounded-lg border border-border-primary bg-surface-tertiary/40 p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Exchange verification</h3>
                {selectedOrder.fork_exchange_reference ? (
                  <div>
                    <p className="text-xs text-text-muted">Reference</p>
                    <p className="mt-0.5 font-mono text-sm text-text-primary break-all">
                      {selectedOrder.fork_exchange_reference}
                    </p>
                  </div>
                ) : null}
                {(selectedOrder.fork_chat_proof_file_ids?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted">Chat screenshots</p>
                    <ProofThumbnailGrid
                      fileIds={selectedOrder.fork_chat_proof_file_ids ?? []}
                      alt="Fork chat proof"
                      onOpen={setProofFileId}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {showForkVerification ? (
              <div className="rounded-lg border border-border-primary p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Add exchange verification</h3>
                <p className="text-xs text-text-muted">
                  FORK orders: save your exchange or counterparty reference and optional chat
                  screenshots (images or PDF, up to {MAX_MULTIPART_FILES_PER_REQUEST} files). You can
                  submit again to append proofs or update the reference.
                </p>
                <Input
                  label="Exchange / order reference"
                  value={forkExchangeRefInput}
                  onChange={(e) => setForkExchangeRefInput(e.target.value)}
                  placeholder="Required — e.g. exchange order id or deal code"
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-secondary">
                    Chat screenshots (optional)
                  </label>
                  <FileUpload
                    compact
                    maxFiles={MAX_MULTIPART_FILES_PER_REQUEST}
                    onChange={(files) => setForkUploadFiles(files)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  loading={forkVerificationMutation.isPending}
                  disabled={!forkExchangeRefInput.trim()}
                  onClick={() => forkVerificationMutation.mutate(selectedOrder)}
                >
                  Save verification
                </Button>
              </div>
            ) : null}

            {selectedOrder.appeals && selectedOrder.appeals.length > 0 && (
              <div className="rounded-lg border border-border-primary p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Appeals</h3>
                {selectedOrder.appeals.map((appeal, idx) => (
                  <div
                    key={appeal.id}
                    className={`space-y-3 ${idx > 0 ? 'border-t border-border-primary pt-3' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <Badge
                        variant={
                          appeal.status === 'OPEN'
                            ? 'warning'
                            : appeal.status === 'RESOLVED'
                              ? 'success'
                              : 'danger'
                        }
                      >
                        {appeal.status}
                      </Badge>
                      <span>Paid: {formatCurrency(appeal.paid_amount, selectedOrder.currency)}</span>
                      <span className="text-text-muted">{formatDateFull(appeal.created_at)}</span>
                    </div>

                    {appeal.proofs_of_payment && appeal.proofs_of_payment.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-text-muted">
                          Proof files ({appeal.proofs_of_payment.length})
                        </p>
                        <ProofThumbnailGrid
                          fileIds={appeal.proofs_of_payment}
                          alt="Appeal proof"
                          onOpen={setProofFileId}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedOrder.status === PayInOrderStatus.NEW &&
            selectedOrder.trader_processing_method !== 'FORK' ? (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Bank receipt is authoritative:</span>{' '}
                when you see the transfer on your account, mark Paid or use an adjustment (underpaid /
                overpaid) even if the payer has not tapped &quot;I paid&quot; yet (Verified). Cancel
                here only if needed.
              </p>
            ) : null}

            {selectedOrder.status === PayInOrderStatus.NEW &&
            selectedOrder.trader_processing_method === 'FORK' ? (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">FORK routing:</span> confirm using the
                exchange flow and counterparty chat. Save your exchange reference and chat screenshots
                above, then finalize the order when funds match.
              </p>
            ) : null}

            {selectedOrder.status === PayInOrderStatus.CANCELED && (
              <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Canceled order:</span> if the payer
                actually completed the transfer, use Change status to mark Paid or enter an adjustment
                (underpaid / overpaid).
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <OrderFinalizeDropdown
                order={selectedOrder}
                menuState={finalizeMenu}
                setMenuState={setFinalizeMenu}
                menuAnchor="modal"
                onPickKind={(kind) => onPickFinalizeKind(kind, selectedOrder)}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!proofFileId}
        onClose={() => setProofFileId(null)}
        title="Proof of payment"
        size="xl"
      >
        {proofFileId && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AuthorizedFilePreview
              path={internalPaths.fileById(proofFileId)}
              alt="Appeal proof"
              className="max-h-[75vh]"
            />
          </div>
        )}
      </Modal>
    </>
  );
}

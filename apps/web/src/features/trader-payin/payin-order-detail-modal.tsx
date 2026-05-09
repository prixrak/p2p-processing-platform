'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { PayinOrderStatusBadge } from '@/components/ui/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
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
import { PayinDetailRow } from './payin-detail-row';
import type { FinalizeKind } from './payin-types';
import { CountdownTimer } from './payin-order-cells';

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
              <PayinDetailRow label="Order ID" value={selectedOrder.id} mono />
              <PayinDetailRow label="Request ID" value={selectedOrder.request_id} mono />
              <PayinDetailRow
                label="Amount"
                value={formatCurrency(selectedOrder.amount, selectedOrder.currency)}
              />
              <PayinDetailRow label="Currency" value={selectedOrder.currency || '—'} />
              <PayinDetailRow
                label="Commission"
                value={formatCurrency(selectedOrder.commission, selectedOrder.currency)}
              />
              <PayinDetailRow
                label="Partner amount"
                value={formatCurrency(selectedOrder.partner_amount, selectedOrder.currency)}
              />
              <PayinDetailRow label="Rate" value={String(selectedOrder.rate)} />
              <PayinDetailRow label="Direction" value={payinDirectionLabel(selectedOrder)} />
              {selectedOrder.trader_processing_method ? (
                <PayinDetailRow
                  label="Pay-In routing"
                  value={selectedOrder.trader_processing_method}
                />
              ) : null}
              <PayinDetailRow label="Status">
                <PayinOrderStatusBadge status={selectedOrder.status} />
              </PayinDetailRow>
              <PayinDetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
              <PayinDetailRow label="Bank" value={selectedOrder.bank || '-'} />
              <PayinDetailRow label="Requisite" value={selectedOrder.requisite_number || '-'} mono />
              <PayinDetailRow label="Owner" value={selectedOrder.requisite_owner || '-'} />
              <PayinDetailRow label="Time to complete">
                <CountdownTimer
                  autocloseAt={selectedOrder.autoclose_at}
                  createdAt={selectedOrder.created_at}
                  status={selectedOrder.status}
                  clockOffsetMs={clockOffsetMs}
                />
              </PayinDetailRow>
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(selectedOrder.fork_chat_proof_file_ids ?? []).map((fileId) => (
                        <button
                          key={fileId}
                          type="button"
                          onClick={() => setProofFileId(fileId)}
                          className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-left transition-colors hover:border-accent-blue"
                        >
                          <div className="pointer-events-none aspect-video max-h-28">
                            <AuthorizedFilePreview
                              path={internalPaths.fileById(fileId)}
                              alt="Fork chat proof"
                              className="h-full max-h-28"
                            />
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35">
                            <ExternalLink className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        </button>
                      ))}
                    </div>
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
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,application/pdf"
                    multiple
                    className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-text-primary"
                    onChange={(e) => setForkUploadFiles(Array.from(e.target.files ?? []))}
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
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {(appeal.proofs_of_payment ?? []).map((fileId) => (
                            <button
                              key={fileId}
                              type="button"
                              onClick={() => setProofFileId(fileId)}
                              className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-left transition-colors hover:border-accent-blue"
                            >
                              <div className="pointer-events-none aspect-video max-h-28">
                                <AuthorizedFilePreview
                                  path={internalPaths.fileById(fileId)}
                                  alt="Appeal proof"
                                  className="h-full max-h-28"
                                />
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35">
                                <ExternalLink className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                              </div>
                            </button>
                          ))}
                        </div>
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

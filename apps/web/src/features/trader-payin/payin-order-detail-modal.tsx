'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import {
  PayInOrderStatus,
} from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { payinStatusVariant } from '@/lib/status-helpers';
import { payinStatusLabel } from '@/lib/order-status-ui';
import { CountdownTimer } from './payin-order-cells';
import { payinDirectionLabel } from './payin-finalize-utils';
import { OrderFinalizeDropdown } from './order-finalize-dropdown';
import { PayinDetailRow } from './payin-detail-row';
import type { FinalizeKind } from './payin-types';

export function PayInOrderDetailModal({
  selectedOrder,
  onClose,
  menuOpenOrderId,
  setMenuOpenOrderId,
  onPickFinalizeKind,
}: {
  selectedOrder: OrderDto | null;
  onClose: () => void;
  menuOpenOrderId: string | null;
  setMenuOpenOrderId: (id: string | null) => void;
  onPickFinalizeKind: (kind: FinalizeKind, order: OrderDto) => void;
}) {
  const [proofFileId, setProofFileId] = useState<string | null>(null);

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
            <PayinDetailRow label="Status">
              <Badge variant={payinStatusVariant[selectedOrder.status]} dot>
                {payinStatusLabel(selectedOrder.status)}
              </Badge>
            </PayinDetailRow>
            <PayinDetailRow label="Created" value={formatDateFull(selectedOrder.created_at)} />
            <PayinDetailRow label="Bank" value={selectedOrder.bank || '-'} />
            <PayinDetailRow label="Requisite" value={selectedOrder.requisite_number || '-'} mono />
            <PayinDetailRow label="Owner" value={selectedOrder.requisite_owner || '-'} />
            <PayinDetailRow label="Time to complete">
              <CountdownTimer autocloseAt={selectedOrder.autoclose_at} />
            </PayinDetailRow>
          </div>

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
                                path={`/api/files/${fileId}`}
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

          {selectedOrder.status === PayInOrderStatus.NEW && (
            <p className="rounded-lg border border-border-primary bg-surface-tertiary/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
              <span className="font-medium text-text-primary">Waiting for payer:</span> they must
              confirm they sent the transfer (status becomes Verified). Only then you can confirm you
              received the funds. You can cancel this order if needed.
            </p>
          )}

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
              menuOpenOrderId={menuOpenOrderId}
              setMenuOpenOrderId={setMenuOpenOrderId}
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
            path={`/api/files/${proofFileId}`}
            alt="Appeal proof"
            className="max-h-[75vh]"
          />
        </div>
      )}
    </Modal>
    </>
  );
}

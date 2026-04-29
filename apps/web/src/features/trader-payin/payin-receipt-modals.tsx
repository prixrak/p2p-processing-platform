'use client';

import { FileText, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { shortId } from '@/lib/utils';
import type { OrderDto } from '@p2p/shared';
import { PAYIN_FILES_API_BASE } from './constants';
import { orderPayinProofFileIds } from './payin-finalize-utils';

export function PayInReceiptGalleryModal({
  receiptOrder,
  onClose,
  onOpenProof,
}: {
  receiptOrder: OrderDto | null;
  onClose: () => void;
  onOpenProof: (fileId: string) => void;
}) {
  const ids = receiptOrder ? orderPayinProofFileIds(receiptOrder) : [];

  return (
    <Modal open={!!receiptOrder} onClose={onClose} title="Payment receipts" size="lg">
      {receiptOrder && ids.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Order <span className="font-mono text-text-secondary">{shortId(receiptOrder.id)}</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            {ids.map((fileId) => (
              <button
                key={fileId}
                type="button"
                onClick={() => onOpenProof(fileId)}
                className="group relative aspect-video overflow-hidden rounded-lg border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue cursor-pointer"
              >
                <img
                  src={`${PAYIN_FILES_API_BASE}/api/files/${fileId}`}
                  alt="Payment receipt"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden flex-col items-center justify-center absolute inset-0 text-text-muted">
                  <FileText className="mb-1 h-6 w-6" />
                  <span className="text-xs">View file</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                  <ExternalLink className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PayInProofViewerModal({
  fileId,
  onClose,
}: {
  fileId: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!fileId} onClose={onClose} title="Payment receipt" size="xl">
      {fileId && (
        <div className="flex items-center justify-center">
          <img
            src={`${PAYIN_FILES_API_BASE}/api/files/${fileId}`}
            alt="Payment receipt"
            className="max-h-[70vh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </Modal>
  );
}

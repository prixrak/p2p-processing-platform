'use client';

import { ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import type { TraderPayInOrderDto } from '@p2p/shared';
import { orderPayinProofFileIds } from './payin-finalize-utils';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { internalPaths } from '@/lib/internal-api';

export function PayInReceiptGalleryModal({
  receiptOrder,
  onClose,
  onOpenProof,
}: {
  receiptOrder: TraderPayInOrderDto | null;
  onClose: () => void;
  onOpenProof: (fileId: string) => void;
}) {
  const ids = receiptOrder ? orderPayinProofFileIds(receiptOrder) : [];

  return (
    <Modal open={!!receiptOrder} onClose={onClose} title="Payment receipts" size="lg">
      {receiptOrder && ids.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Order{' '}
            <span className="font-mono text-xs break-all text-text-secondary">{receiptOrder.id}</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            {ids.map((fileId) => (
              <button
                key={fileId}
                type="button"
                onClick={() => onOpenProof(fileId)}
                className="group relative overflow-hidden rounded-lg border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue cursor-pointer"
              >
                <div className="pointer-events-none aspect-video max-h-36">
                  <AuthorizedFilePreview
                    path={internalPaths.fileById(fileId)}
                    alt="Payment receipt"
                    className="h-full max-h-36"
                  />
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
        <div className="flex min-h-[40vh] items-center justify-center">
          <AuthorizedFilePreview
            path={internalPaths.fileById(fileId)}
            alt="Payment receipt"
            className="max-h-[75vh]"
          />
        </div>
      )}
    </Modal>
  );
}

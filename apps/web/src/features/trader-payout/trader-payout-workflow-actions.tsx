'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, ExternalLink, ImagePlus, Play } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus, PayoutTraderRejectReason, MAX_PAYOUT_COMPLETION_PROOF_FILES } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { maskRequisite } from '@/features/trader-payin/payin-finalize-utils';
import { cn, formatCurrency, shortId } from '@/lib/utils';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import type { PayoutCompleteVars } from './trader-payout-columns';
import { payoutCompletionProofFileIds } from './payout-completion-proof-ids';

export type PayoutRejectVars = {
  orderId: string;
  reason: PayoutTraderRejectReason;
  /** Sent only when `reason` is OTHER. */
  reason_other_note?: string;
};

const REJECT_REASON_META: {
  reason: PayoutTraderRejectReason;
  label: string;
}[] = [
  { reason: PayoutTraderRejectReason.FOREIGN_CARD, label: 'Foreign card' },
  {
    reason: PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS,
    label: 'Card cancellation or refund in progress',
  },
  { reason: PayoutTraderRejectReason.OTHER, label: 'Other' },
];

type ConfirmKind = 'complete' | 'cancel';

type MenuAlign = 'left' | 'right';

function useFixedDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  layout: 'cell' | 'toolbar',
) {
  const [pos, setPos] = useState<{ top: number; left: number; align: MenuAlign }>({
    top: 0,
    left: 0,
    align: 'right',
  });

  const update = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    if (layout === 'toolbar') {
      setPos({ top: r.bottom + gap, left: r.left, align: 'left' });
    } else {
      setPos({ top: r.bottom + gap, left: r.right, align: 'right' });
    }
  }, [layout, triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => update();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, update]);

  return pos;
}

export function TraderPayoutWorkflowActions({
  order,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
  attachCompletionProofMutation,
  layout = 'cell',
}: {
  order: PayOutOrderApiDto;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  /** When set, COMPLETED orders can append proof files via POST .../completion-proof. */
  attachCompletionProofMutation?: UseMutationResult<
    PayOutOrderApiDto,
    unknown,
    { orderId: string; fileIds: string[] }
  >;
  layout?: 'cell' | 'toolbar';
}) {
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptUploadKey, setReceiptUploadKey] = useState(0);
  const [receiptScratch, setReceiptScratch] = useState<File[]>([]);
  const [viewingPayoutReceiptId, setViewingPayoutReceiptId] = useState<string | null>(null);

  const [completeConfirmFiles, setCompleteConfirmFiles] = useState<File[]>([]);
  const [completeConfirmUploadKey, setCompleteConfirmUploadKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuPos = useFixedDropdownPosition(menuOpen, menuTriggerRef, layout);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<PayoutTraderRejectReason | null>(null);
  const [rejectOtherNote, setRejectOtherNote] = useState('');

  const persistHistoryProof =
    attachCompletionProofMutation != null && order.status === PayOutOrderStatus.COMPLETED;

  const loadingAttachProof =
    attachCompletionProofMutation != null &&
    attachCompletionProofMutation.isPending &&
    attachCompletionProofMutation.variables?.orderId === order.id;

  const openReceiptModal = useCallback(() => {
    setReceiptUploadKey((k) => k + 1);
    setReceiptScratch([]);
    setReceiptModalOpen(true);
  }, []);

  const saveReceiptModal = useCallback(async () => {
    if (persistHistoryProof) {
      if (receiptScratch.length === 0) {
        setReceiptModalOpen(false);
        return;
      }
      const maxAdd = Math.max(
        0,
        MAX_PAYOUT_COMPLETION_PROOF_FILES - payoutCompletionProofFileIds(order).length,
      );
      if (maxAdd === 0) {
        setReceiptModalOpen(false);
        return;
      }
      const toUpload = receiptScratch.slice(0, maxAdd);
      try {
        const uploadedIds: string[] = [];
        for (const file of toUpload) {
          const fd = new FormData();
          fd.append('file', file);
          const meta = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
          uploadedIds.push(meta.id);
        }
        await attachCompletionProofMutation!.mutateAsync({
          orderId: order.id,
          fileIds: uploadedIds,
        });
      } catch {
        return;
      }
      setReceiptModalOpen(false);
      setReceiptScratch([]);
      setReceiptUploadKey((k) => k + 1);
      return;
    }

    if (receiptScratch.length > 0) {
      setReceiptFiles((prev) =>
        [...prev, ...receiptScratch].slice(0, MAX_PAYOUT_COMPLETION_PROOF_FILES),
      );
    }
    setReceiptModalOpen(false);
  }, [
    attachCompletionProofMutation,
    order.id,
    persistHistoryProof,
    receiptScratch,
  ]);

  const removeReceiptAttachment = useCallback(() => {
    setReceiptFiles([]);
    setReceiptScratch([]);
    setReceiptUploadKey((k) => k + 1);
    setReceiptModalOpen(false);
  }, []);

  const closeReceiptModal = useCallback(() => {
    setReceiptModalOpen(false);
    setViewingPayoutReceiptId(null);
  }, []);

  useEffect(() => {
    setReceiptFiles([]);
    setReceiptModalOpen(false);
    setReceiptScratch([]);
    setReceiptUploadKey((k) => k + 1);
    setCompleteConfirmFiles([]);
    setCompleteConfirmUploadKey((k) => k + 1);
    setViewingPayoutReceiptId(null);
  }, [order.id, order.status]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const openConfirm = useCallback((kind: ConfirmKind) => {
    setMenuOpen(false);
    setConfirmKind(kind);
    if (kind === 'complete') {
      setCompleteConfirmUploadKey((k) => k + 1);
      setCompleteConfirmFiles([]);
    }
    setConfirmOpen(true);
  }, []);

  const closeRejectModal = useCallback(() => {
    if (rejectMutation.isPending && rejectMutation.variables?.orderId === order.id) return;
    setRejectModalOpen(false);
    setRejectReason(null);
    setRejectOtherNote('');
  }, [order.id, rejectMutation.isPending, rejectMutation.variables?.orderId]);

  const handleConfirm = useCallback(() => {
    if (!confirmKind) return;
    if (confirmKind === 'complete') {
      const filesFromDialog = [...completeConfirmFiles];
      setConfirmOpen(false);
      setConfirmKind(null);
      setCompleteConfirmFiles([]);
      setCompleteConfirmUploadKey((k) => k + 1);
      void (async () => {
        const fromDialog = [...filesFromDialog];
        const pickFiles =
          fromDialog.length > 0 ? fromDialog : [...receiptFiles];
        const capped = pickFiles.slice(0, MAX_PAYOUT_COMPLETION_PROOF_FILES);
        const uploadedIds: string[] = [];
        for (const file of capped) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const meta = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
            uploadedIds.push(meta.id);
          } catch {
            return;
          }
        }
        completeMutation.mutate({
          orderId: order.id,
          ...(uploadedIds.length > 0 ? { completionProofFileIds: uploadedIds } : {}),
        });
      })();
      return;
    }
    if (confirmKind === 'cancel') {
      cancelMutation.mutate(order.id);
    }
    setConfirmOpen(false);
    setConfirmKind(null);
  }, [
    cancelMutation,
    completeConfirmFiles,
    completeMutation,
    confirmKind,
    order.id,
    receiptFiles,
  ]);

  const handleRejectSubmit = useCallback(() => {
    if (!rejectReason) return;
    if (
      rejectReason === PayoutTraderRejectReason.OTHER &&
      rejectOtherNote.trim().length === 0
    ) {
      return;
    }
    const payload: PayoutRejectVars = {
      orderId: order.id,
      reason: rejectReason,
      ...(rejectReason === PayoutTraderRejectReason.OTHER
        ? { reason_other_note: rejectOtherNote.trim() }
        : {}),
    };
    rejectMutation.mutate(payload, {
      onSuccess: () => {
        setRejectModalOpen(false);
        setRejectReason(null);
        setRejectOtherNote('');
      },
    });
  }, [order.id, rejectMutation, rejectOtherNote, rejectReason]);

  const loadingComplete =
    completeMutation.isPending && completeMutation.variables?.orderId === order.id;
  const loadingCancel = cancelMutation.isPending && cancelMutation.variables === order.id;
  const loadingReject =
    rejectMutation.isPending &&
    rejectMutation.variables?.orderId === order.id;
  const loadingProcess = processMutation.isPending && processMutation.variables === order.id;

  const confirmLoading =
    confirmKind === 'complete'
      ? loadingComplete
      : confirmKind === 'cancel'
        ? loadingCancel
        : false;

  let confirmTitle = '';
  let confirmDescription = '';
  let confirmLabel = 'Confirm';
  let tone: 'default' | 'danger' = 'default';

  if (confirmKind === 'complete') {
    confirmTitle = 'Mark this pay-out as completed?';
    confirmDescription =
      'Only confirm after the recipient has received the funds. This action cannot be undone.';
    confirmLabel = 'Yes, completed';
  } else if (confirmKind === 'cancel') {
    confirmTitle = 'Return this order to the pool?';
    confirmDescription =
      'The order will be available for another trader. The merchant is not refunded.';
    confirmLabel = 'Yes, return to pool';
    tone = 'danger';
  }

  const btnClass =
    layout === 'cell'
      ? 'inline-flex h-9 items-center gap-1 rounded-lg border border-border-primary bg-bg-primary px-3 text-sm font-medium text-text-primary hover:bg-bg-secondary'
      : 'inline-flex h-10 items-center gap-1 rounded-lg border border-border-primary bg-bg-primary px-4 text-sm font-medium text-text-primary hover:bg-bg-secondary';

  const rejectSubmitEnabled =
    rejectReason != null &&
    (rejectReason !== PayoutTraderRejectReason.OTHER || rejectOtherNote.trim().length > 0);

  const maskedNumber =
    order.requisites_visible === false ? '—' : maskRequisite(order.details.number);

  const existingProofIds = payoutCompletionProofFileIds(order);
  const proofSlotsRemaining = persistHistoryProof
    ? Math.max(0, MAX_PAYOUT_COMPLETION_PROOF_FILES - existingProofIds.length)
    : Math.max(0, MAX_PAYOUT_COMPLETION_PROOF_FILES - receiptFiles.length);

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        ref={wrapRef}
        onClick={(e) => e.stopPropagation()}
      >
        {order.status === PayOutOrderStatus.NEW &&
          (layout === 'cell' ? (
            <IconButton
              label="Start processing payout"
              variant="primary"
              onClick={() => processMutation.mutate(order.id)}
              loading={loadingProcess}
            >
              <Play className="h-4 w-4" />
            </IconButton>
          ) : (
            <Button
              variant="primary"
              onClick={() => processMutation.mutate(order.id)}
              loading={loadingProcess}
            >
              <Play className="h-4 w-4" />
              Start processing
            </Button>
          ))}

        {order.status === PayOutOrderStatus.PROCESSING && (
          <div
            className={cn('flex flex-wrap items-center gap-2', layout === 'cell' && 'justify-end')}
          >
            <button
                ref={menuTriggerRef}
                type="button"
                className={cn(
                  btnClass,
                  (loadingComplete || loadingCancel || loadingReject) && 'opacity-70',
                )}
                disabled={loadingComplete || loadingCancel || loadingReject}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                onClick={() => setMenuOpen((o) => !o)}
              >
                Change status
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </button>

              {order.requisites_visible !== false && (
                <IconButton
                  label={
                    receiptFiles.length > 0
                      ? 'Edit payment receipts — files upload when you mark completed'
                      : 'Attach payment receipts (optional)'
                  }
                  tooltipWide
                  variant={receiptFiles.length > 0 ? 'secondary' : 'ghost'}
                  disabled={loadingComplete || loadingCancel || loadingReject}
                  onClick={openReceiptModal}
                >
                  <ImagePlus className="h-4 w-4" />
                </IconButton>
              )}

              {menuOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                  <div
                    ref={menuPanelRef}
                    className="min-w-[14rem] overflow-visible rounded-lg border border-border-primary bg-bg-primary py-1 shadow-lg"
                    style={{
                      position: 'fixed',
                      top: menuPos.top,
                      left: menuPos.left,
                      transform: menuPos.align === 'right' ? 'translateX(-100%)' : undefined,
                      zIndex: 250,
                    }}
                    role="menu"
                  >
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
                      role="menuitem"
                      onClick={() => openConfirm('complete')}
                    >
                      Mark completed
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
                      role="menuitem"
                      onClick={() => openConfirm('cancel')}
                    >
                      Return to pool
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setRejectReason(null);
                        setRejectOtherNote('');
                        setRejectModalOpen(true);
                      }}
                    >
                      Rejected
                    </button>
                  </div>,
                  document.body,
                )}
            </div>
        )}

        {persistHistoryProof && (
          <div
            className={cn('flex flex-wrap items-center gap-2', layout === 'cell' && 'justify-end')}
          >
            <IconButton
              label={
                existingProofIds.length > 0
                  ? 'Add more payment receipts for this completed order'
                  : 'Attach payment receipts to this completed order'
              }
              tooltipWide
              variant={existingProofIds.length > 0 ? 'secondary' : 'ghost'}
              disabled={loadingAttachProof}
              onClick={openReceiptModal}
            >
              <ImagePlus className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && !confirmLoading) {
            setConfirmOpen(false);
            setConfirmKind(null);
            setCompleteConfirmFiles([]);
            setCompleteConfirmUploadKey((k) => k + 1);
          }
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        tone={tone}
        loading={confirmLoading}
        onConfirm={handleConfirm}
      >
        {confirmOpen && confirmKind === 'complete' ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Optional receipts (PNG, JPG, PDF), up to {MAX_PAYOUT_COMPLETION_PROOF_FILES} files. Attach here or use
              the image button next to Change status.
            </p>
            <FileUpload
              compact
              maxFiles={MAX_PAYOUT_COMPLETION_PROOF_FILES}
              key={completeConfirmUploadKey}
              disabled={loadingComplete}
              onChange={setCompleteConfirmFiles}
            />
          </div>
        ) : null}
      </ConfirmDialog>

      <Modal
        open={receiptModalOpen}
        onClose={closeReceiptModal}
        title="Payment receipt"
        subtitle={`Order ${shortId(order.id)}`}
        size="md"
        overlayClassName="z-[58]"
      >
        <p className="text-sm text-text-secondary">
          {persistHistoryProof
            ? 'Upload transfer receipts for your records. You can add more files (up to ten per order) after completion.'
            : (
                <>
                  Optional proof of the transfer — same idea as pay-in appeal attachments. Files are sent when you
                  choose <span className="font-medium text-text-primary">Mark completed</span> (up to{' '}
                  {MAX_PAYOUT_COMPLETION_PROOF_FILES} files).
                </>
              )}
        </p>
        {receiptFiles.length > 0 && !persistHistoryProof && (
          <p className="mt-3 rounded-lg border border-border-primary bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
            Saved for this order:{' '}
            <span className="font-medium text-text-primary">
              {receiptFiles.length} file{receiptFiles.length === 1 ? '' : 's'}
              {receiptFiles.length <= 3
                ? ` (${receiptFiles.map((f) => f.name).join(', ')})`
                : ''}
            </span>
          </p>
        )}
        {persistHistoryProof && existingProofIds.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-text-secondary">
              Current receipts — click a thumbnail to enlarge. Upload below to add more (max{' '}
              {MAX_PAYOUT_COMPLETION_PROOF_FILES} per order).
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {existingProofIds.map((fileId) => (
                <button
                  key={fileId}
                  type="button"
                  onClick={() => setViewingPayoutReceiptId(fileId)}
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-left transition-colors hover:border-accent-blue"
                >
                  <div className="pointer-events-none aspect-video max-h-36">
                    <AuthorizedFilePreview
                      path={internalPaths.fileById(fileId)}
                      alt="Pay-out payment receipt"
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
        <div className="mt-4">
          {proofSlotsRemaining > 0 ? (
            <FileUpload
              key={receiptUploadKey}
              maxFiles={proofSlotsRemaining}
              disabled={loadingAttachProof}
              onChange={setReceiptScratch}
            />
          ) : (
            <p className="rounded-lg border border-border-primary bg-bg-secondary/40 px-3 py-2 text-xs text-text-secondary">
              Maximum of {MAX_PAYOUT_COMPLETION_PROOF_FILES} receipts for this order.
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-border-primary pt-4 sm:flex-row sm:items-center sm:justify-between">
          {!persistHistoryProof ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:mr-auto"
              disabled={receiptFiles.length === 0 && receiptScratch.length === 0}
              onClick={removeReceiptAttachment}
            >
              Remove attachment
            </Button>
          ) : (
            <span className="text-xs text-text-muted sm:mr-auto">
              Saves immediately to this completed order.
            </span>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeReceiptModal} disabled={loadingAttachProof}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={loadingAttachProof}
              disabled={persistHistoryProof && receiptScratch.length === 0}
              onClick={() => void saveReceiptModal()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={viewingPayoutReceiptId != null}
        onClose={() => setViewingPayoutReceiptId(null)}
        title="Payment receipt"
        size="xl"
        overlayClassName="z-[62]"
      >
        {viewingPayoutReceiptId && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AuthorizedFilePreview
              path={internalPaths.fileById(viewingPayoutReceiptId)}
              alt="Pay-out payment receipt"
              className="max-h-[75vh]"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={rejectModalOpen}
        onClose={closeRejectModal}
        overlayClassName="z-[60]"
        closeOnBackdropClick={!loadingReject}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-orange/15 text-accent-orange">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold text-text-primary">Are you sure?</h2>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Status will be set to{' '}
          <span className="font-medium text-text-primary">Failed (rejected)</span>.
        </p>

        <dl className="mt-5 divide-y divide-border-primary rounded-lg border border-border-primary bg-bg-secondary/40 text-sm">
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">Number</dt>
            <dd className="font-mono text-text-primary">{maskedNumber}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">Amount</dt>
            <dd className="tabular-nums text-text-primary">
              {formatCurrency(order.amount, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">Owner</dt>
            <dd className="text-right text-text-primary">
              {order.requisites_visible === false
                ? '—'
                : order.details.owner?.trim()
                  ? order.details.owner
                  : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-text-primary">Rejection reason</p>
          <div className="space-y-2.5" role="radiogroup" aria-label="Rejection reason">
            {REJECT_REASON_META.map(({ reason: value, label }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                  rejectReason === value
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border-primary text-text-secondary hover:border-border-secondary',
                )}
              >
                <input
                  type="radio"
                  name={`payout-reject-${order.id}`}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent-blue"
                  checked={rejectReason === value}
                  onChange={() => {
                    setRejectReason(value);
                    if (value !== PayoutTraderRejectReason.OTHER) {
                      setRejectOtherNote('');
                    }
                  }}
                />
                <span className="leading-snug">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {rejectReason === PayoutTraderRejectReason.OTHER && (
          <div className="mt-4">
            <Textarea
              id={`payout-reject-other-${order.id}`}
              label="Describe the reason"
              placeholder="Required when you select Other"
              rows={4}
              maxLength={2000}
              value={rejectOtherNote}
              onChange={(e) => setRejectOtherNote(e.target.value)}
              disabled={loadingReject}
              required
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border-primary pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={loadingReject}
            onClick={closeRejectModal}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loadingReject}
            disabled={!rejectSubmitEnabled}
            onClick={handleRejectSubmit}
          >
            Reject pay-out
          </Button>
        </div>
      </Modal>
    </>
  );
}

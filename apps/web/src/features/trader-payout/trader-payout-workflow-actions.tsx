'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus, PayoutTraderRejectReason, MAX_PAYOUT_COMPLETION_PROOF_FILES } from '@p2p/shared';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
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
import {
  mergeCompletionProofUploadIdsForComplete,
  payoutCompletionProofFileIds,
} from './payout-completion-proof-ids';


export type PayoutRejectVars = {
  orderId: string;
  reason: PayoutTraderRejectReason;
  /** Sent only when `reason` is OTHER. */
  reason_other_note?: string;
};

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
  detachCompletionProofMutation,
  layout = 'cell',
}: {
  order: PayOutOrderCabinetDto;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  /** When set, PROCESSING and COMPLETED orders can append proof files via POST .../completion-proof. */
  attachCompletionProofMutation?: UseMutationResult<
    PayOutOrderCabinetDto,
    unknown,
    { orderId: string; fileIds: string[] }
  >;
  /** When set, attached proofs can be removed via DELETE .../completion-proof/:fileId. */
  detachCompletionProofMutation?: UseMutationResult<
    PayOutOrderCabinetDto,
    unknown,
    { orderId: string; fileId: string }
  >;
  layout?: 'cell' | 'toolbar';
}) {
  const t = useTranslations('Trader.Payout.workflow');
  const rejectReasonMeta = useMemo(
    () => [
      { reason: PayoutTraderRejectReason.FOREIGN_CARD, label: t('rejectReasonForeignCard') },
      {
        reason: PayoutTraderRejectReason.CARD_REFUND_IN_PROGRESS,
        label: t('rejectReasonRefund'),
      },
      { reason: PayoutTraderRejectReason.OTHER, label: t('rejectReasonOther') },
    ],
    [t],
  );

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptUploadKey, setReceiptUploadKey] = useState(0);
  const [receiptScratch, setReceiptScratch] = useState<File[]>([]);
  const [savingReceiptAttachments, setSavingReceiptAttachments] = useState(false);
  const [viewingPayoutReceiptId, setViewingPayoutReceiptId] = useState<string | null>(null);
  // Per-file deletion spinners so individual X buttons can show progress without
  // blocking the rest of the modal.
  const [pendingDeleteFileIds, setPendingDeleteFileIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const persistProofsImmediately =
    attachCompletionProofMutation != null &&
    (order.status === PayOutOrderStatus.PROCESSING ||
      order.status === PayOutOrderStatus.COMPLETED);

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
    if (!persistProofsImmediately) {
      setReceiptModalOpen(false);
      return;
    }
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

    setSavingReceiptAttachments(true);
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
    } finally {
      setSavingReceiptAttachments(false);
    }

    setReceiptModalOpen(false);
    setReceiptScratch([]);
    setReceiptUploadKey((k) => k + 1);
  }, [
    attachCompletionProofMutation,
    order,
    persistProofsImmediately,
    receiptScratch,
  ]);

  const removeAllPersistedReceiptsModal = useCallback(async () => {
    setReceiptScratch([]);
    setReceiptUploadKey((k) => k + 1);

    const serverIds = [...payoutCompletionProofFileIds(order)];
    setPendingDeleteFileIds((prev) => {
      const next = new Set(prev);
      serverIds.forEach((id) => next.add(id));
      return next;
    });

    try {
      if (!detachCompletionProofMutation || serverIds.length === 0) {
        return;
      }
      await Promise.all(
        serverIds.map((fileId) =>
          detachCompletionProofMutation.mutateAsync({ orderId: order.id, fileId }),
        ),
      );
      setViewingPayoutReceiptId(null);
    } catch {
      // Keep thumbnails visible on failure where the mutation handlers did not update.
    } finally {
      setPendingDeleteFileIds((prev) => {
        const next = new Set(prev);
        serverIds.forEach((id) => next.delete(id));
        return next;
      });
    }
    setReceiptModalOpen(false);
  }, [detachCompletionProofMutation, order]);

  const detachAttachedProof = useCallback(
    async (fileId: string) => {
      if (!detachCompletionProofMutation) return;
      setPendingDeleteFileIds((prev) => {
        const next = new Set(prev);
        next.add(fileId);
        return next;
      });
      try {
        await detachCompletionProofMutation.mutateAsync({
          orderId: order.id,
          fileId,
        });
        setViewingPayoutReceiptId((prev) => (prev === fileId ? null : prev));
      } catch {
        // Keep the thumbnail visible on failure; the mutation surface can
        // expose the error elsewhere if needed.
      } finally {
        setPendingDeleteFileIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    },
    [detachCompletionProofMutation, order.id],
  );

  const closeReceiptModal = useCallback(() => {
    setReceiptModalOpen(false);
    setViewingPayoutReceiptId(null);
  }, []);

  useLayoutEffect(() => {
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
        const slotsLeft = Math.max(
          0,
          MAX_PAYOUT_COMPLETION_PROOF_FILES - payoutCompletionProofFileIds(order).length,
        );
        const cappedFiles = filesFromDialog.slice(0, slotsLeft);

        const dialogUploadIds: string[] = [];
        for (const file of cappedFiles) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const meta = await api.upload<{ id: string }>(internalPaths.fileUpload, fd);
            dialogUploadIds.push(meta.id);
          } catch {
            return;
          }
        }

        const uniqueNew = mergeCompletionProofUploadIdsForComplete(
          [],
          dialogUploadIds,
          MAX_PAYOUT_COMPLETION_PROOF_FILES,
        );

        completeMutation.mutate({
          orderId: order.id,
          ...(uniqueNew.length > 0 ? { completionProofFileIds: uniqueNew } : {}),
        });
      })();
      return;
    }
    if (confirmKind === 'cancel') {
      cancelMutation.mutate(order.id);
    }
    setConfirmOpen(false);
    setConfirmKind(null);
  }, [cancelMutation, completeConfirmFiles, completeMutation, confirmKind, order]);

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
  let confirmLabel = t('confirmDefault');
  let tone: 'default' | 'danger' = 'default';

  if (confirmKind === 'complete') {
    confirmTitle = t('completeTitle');
    confirmDescription = t('completeDescription');
    confirmLabel = t('completeLabel');
  } else if (confirmKind === 'cancel') {
    confirmTitle = t('cancelTitle');
    confirmDescription = t('cancelDescription');
    confirmLabel = t('cancelLabel');
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
  const proofSlotsRemaining = persistProofsImmediately
    ? Math.max(0, MAX_PAYOUT_COMPLETION_PROOF_FILES - existingProofIds.length)
    : 0;

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
              label={t('startProcessingAria')}
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
              {t('startProcessing')}
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
                {t('changeStatus')}
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </button>

              {order.requisites_visible !== false && (
                <IconButton
                  label={
                    existingProofIds.length > 0 ? t('editReceipts') : t('attachReceiptsOptional')
                  }
                  tooltipWide
                  variant={existingProofIds.length > 0 ? 'secondary' : 'ghost'}
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
                      {t('menuComplete')}
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
                      role="menuitem"
                      onClick={() => openConfirm('cancel')}
                    >
                      {t('menuReturnPool')}
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
                      {t('menuFail')}
                    </button>
                  </div>,
                  document.body,
                )}
            </div>
        )}

        {persistProofsImmediately && order.status === PayOutOrderStatus.COMPLETED && (
          <div
            className={cn('flex flex-wrap items-center gap-2', layout === 'cell' && 'justify-end')}
          >
            <IconButton
              label={
                existingProofIds.length > 0 ? t('addMoreReceipts') : t('attachReceiptsCompleted')
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
              {t('completeFilesHint', { max: MAX_PAYOUT_COMPLETION_PROOF_FILES })}
            </p>
            <FileUpload
              compact
              maxFiles={Math.max(
                0,
                MAX_PAYOUT_COMPLETION_PROOF_FILES - existingProofIds.length,
              )}
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
        title={t('receiptModalTitle')}
        subtitle={t('receiptModalSubtitle', { shortId: shortId(order.id) })}
        size="md"
        overlayClassName="z-[58]"
      >
        <p className="text-sm text-text-secondary">
          {persistProofsImmediately ? (
            t.rich('receiptBodyPersist', {
              max: MAX_PAYOUT_COMPLETION_PROOF_FILES,
              save: (chunks) => <span className="font-medium text-text-primary">{chunks}</span>,
            })
          ) : (
            t('receiptBodyDisabled')
          )}
        </p>
        {persistProofsImmediately && existingProofIds.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-text-secondary">
              {t('currentReceiptsHint', { max: MAX_PAYOUT_COMPLETION_PROOF_FILES })}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {existingProofIds.map((fileId) => {
                const deleting = pendingDeleteFileIds.has(fileId);
                const canDetach = detachCompletionProofMutation != null;
                return (
                  <div
                    key={fileId}
                    className={cn(
                      'group relative overflow-hidden rounded-lg border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue focus-within:border-accent-blue',
                      deleting && 'opacity-60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setViewingPayoutReceiptId(fileId)}
                      aria-label={t('viewReceiptAria')}
                      className="relative block w-full cursor-pointer overflow-hidden rounded-lg border-0 bg-transparent p-0 text-left"
                    >
                      <div className="pointer-events-none aspect-video max-h-36">
                        <AuthorizedFilePreview
                          path={internalPaths.fileById(fileId)}
                          alt={t('receiptThumbAlt')}
                          className="h-full max-h-36"
                        />
                      </div>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                        <ExternalLink className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                    {canDetach && (
                      <button
                        type="button"
                        disabled={loadingAttachProof || deleting}
                        aria-label={t('removeReceiptAria')}
                        className={cn(
                          'absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-md',
                          'border border-border-primary bg-bg-primary/95 text-text-primary shadow-sm',
                          'hover:bg-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue',
                          'disabled:pointer-events-none disabled:opacity-50',
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void detachAttachedProof(fileId);
                        }}
                      >
                        {deleting ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <X className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-4">
          {proofSlotsRemaining > 0 ? (
            <FileUpload
              key={receiptUploadKey}
              maxFiles={proofSlotsRemaining}
              disabled={loadingAttachProof || savingReceiptAttachments}
              onChange={setReceiptScratch}
            />
          ) : (
            <p className="rounded-lg border border-border-primary bg-bg-secondary/40 px-3 py-2 text-xs text-text-secondary">
              {t('receiptMaxNote', { max: MAX_PAYOUT_COMPLETION_PROOF_FILES })}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-border-primary pt-4 sm:flex-row sm:items-end sm:justify-between">
          {persistProofsImmediately ? (
            <div className="flex flex-col gap-2 sm:max-w-md sm:flex-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={
                  (existingProofIds.length === 0 && receiptScratch.length === 0) ||
                  savingReceiptAttachments ||
                  pendingDeleteFileIds.size > 0 ||
                  (existingProofIds.length > 0 && !detachCompletionProofMutation)
                }
                loading={pendingDeleteFileIds.size > 0 && existingProofIds.length > 0}
                onClick={() => void removeAllPersistedReceiptsModal()}
              >
                {t('removeAll')}
              </Button>
              <p className="hidden text-xs text-text-muted sm:block">
                {t('saveFooterHint')}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeReceiptModal}
              disabled={
                loadingAttachProof ||
                savingReceiptAttachments ||
                pendingDeleteFileIds.size > 0
              }
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              loading={loadingAttachProof || savingReceiptAttachments}
              disabled={receiptScratch.length === 0 || pendingDeleteFileIds.size > 0}
              onClick={() => void saveReceiptModal()}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={viewingPayoutReceiptId != null}
        onClose={() => setViewingPayoutReceiptId(null)}
        title={t('previewTitle')}
        size="xl"
        overlayClassName="z-[62]"
      >
        {viewingPayoutReceiptId && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AuthorizedFilePreview
              path={internalPaths.fileById(viewingPayoutReceiptId)}
              alt={t('receiptThumbAlt')}
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
          <h2 className="text-lg font-semibold text-text-primary">{t('rejectSureTitle')}</h2>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          {t.rich('rejectSureBody', {
            strong: (chunks) => (
              <span className="font-medium text-text-primary">{chunks}</span>
            ),
          })}
        </p>

        <dl className="mt-5 divide-y divide-border-primary rounded-lg border border-border-primary bg-bg-secondary/40 text-sm">
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">{t('rejectDlNumber')}</dt>
            <dd className="font-mono text-text-primary">{maskedNumber}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">{t('rejectDlAmount')}</dt>
            <dd className="tabular-nums text-text-primary">
              {formatCurrency(order.amount, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-text-muted">{t('rejectDlOwner')}</dt>
            <dd className="text-right text-text-primary">
              {order.requisites_visible === false
                ? t('rejectNumberMasked')
                : order.details.owner?.trim()
                  ? order.details.owner
                  : t('rejectNumberMasked')}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-text-primary">{t('rejectReasonHeading')}</p>
          <div className="space-y-2.5" role="radiogroup" aria-label={t('rejectReasonAria')}>
            {rejectReasonMeta.map(({ reason: value, label }) => (
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
              label={t('rejectOtherLabel')}
              placeholder={t('rejectOtherPlaceholder')}
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
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loadingReject}
            disabled={!rejectSubmitEnabled}
            onClick={handleRejectSubmit}
          >
            {t('rejectSubmit')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

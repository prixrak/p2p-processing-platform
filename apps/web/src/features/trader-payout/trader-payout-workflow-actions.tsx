'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { PayOutOrderStatus, PayoutTraderRejectReason } from '@p2p/shared';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { PayoutCompleteVars } from './trader-payout-columns';

export type PayoutRejectVars = { orderId: string; reason: PayoutTraderRejectReason };

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

type ConfirmKind = 'complete' | 'cancel' | 'reject';

export function TraderPayoutWorkflowActions({
  order,
  processMutation,
  completeMutation,
  cancelMutation,
  rejectMutation,
  onCompleteWithProof,
  layout = 'cell',
}: {
  order: PayOutOrderApiDto;
  processMutation: UseMutationResult<unknown, unknown, string>;
  completeMutation: UseMutationResult<unknown, unknown, PayoutCompleteVars>;
  cancelMutation: UseMutationResult<unknown, unknown, string>;
  rejectMutation: UseMutationResult<unknown, unknown, PayoutRejectVars>;
  /** When set (e.g. specialist + optional proof upload), invoked instead of a plain complete mutate. */
  onCompleteWithProof?: () => void | Promise<void>;
  layout?: 'cell' | 'toolbar';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [pendingRejectReason, setPendingRejectReason] = useState<PayoutTraderRejectReason | null>(
    null,
  );

  useEffect(() => {
    if (!menuOpen && !rejectOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMenuOpen(false);
        setRejectOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, rejectOpen]);

  const openConfirm = useCallback((kind: ConfirmKind, rejectReason?: PayoutTraderRejectReason) => {
    setMenuOpen(false);
    setRejectOpen(false);
    setConfirmKind(kind);
    setPendingRejectReason(rejectReason ?? null);
    setConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!confirmKind) return;
    if (confirmKind === 'complete') {
      if (onCompleteWithProof) {
        void onCompleteWithProof();
      } else {
        completeMutation.mutate({ orderId: order.id });
      }
    } else if (confirmKind === 'cancel') {
      cancelMutation.mutate(order.id);
    } else if (confirmKind === 'reject' && pendingRejectReason) {
      rejectMutation.mutate({ orderId: order.id, reason: pendingRejectReason });
    }
    setConfirmOpen(false);
    setConfirmKind(null);
    setPendingRejectReason(null);
  }, [
    cancelMutation,
    completeMutation,
    confirmKind,
    onCompleteWithProof,
    order.id,
    pendingRejectReason,
    rejectMutation,
  ]);

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
        : confirmKind === 'reject'
          ? loadingReject
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
  } else if (confirmKind === 'reject') {
    confirmTitle = 'Reject this pay-out?';
    confirmDescription =
      'The order will be closed as failed. When applicable, funds are returned to the merchant and the order will not reappear in the pool.';
    confirmLabel = 'Yes, reject';
    tone = 'danger';
  }

  const btnClass =
    layout === 'cell'
      ? 'inline-flex h-9 items-center gap-1 rounded-lg border border-border-primary bg-bg-primary px-3 text-sm font-medium text-text-primary hover:bg-bg-secondary'
      : 'inline-flex h-10 items-center gap-1 rounded-lg border border-border-primary bg-bg-primary px-4 text-sm font-medium text-text-primary hover:bg-bg-secondary';

  return (
    <>
      <div
        className={cn('flex flex-wrap items-center gap-2', layout === 'cell' && 'relative')}
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
          <>
            <button
              type="button"
              className={cn(
                btnClass,
                (loadingComplete || loadingCancel || loadingReject) && 'opacity-70',
              )}
              disabled={loadingComplete || loadingCancel || loadingReject}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => {
                setRejectOpen(false);
                setMenuOpen((o) => !o);
              }}
            >
              Change status
              <ChevronDown className={cn('h-4 w-4 transition', menuOpen && 'rotate-180')} />
            </button>

            {menuOpen && (
              <div
                className={cn(
                  'absolute right-0 top-full z-50 mt-1 min-w-[14rem] overflow-visible rounded-lg border border-border-primary bg-bg-primary py-1 shadow-lg',
                  layout === 'toolbar' && 'left-0 right-auto',
                )}
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
                <div className="relative isolate">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
                    role="menuitem"
                    aria-expanded={rejectOpen}
                    onClick={() => setRejectOpen((r) => !r)}
                  >
                    Rejected
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-text-muted transition-transform',
                        rejectOpen && 'rotate-90',
                      )}
                      aria-hidden
                    />
                  </button>
                  {rejectOpen && (
                    <div
                      className={cn(
                        'border-t border-border-primary bg-bg-secondary/50 py-1',
                        layout === 'cell' &&
                          'absolute right-full top-0 z-[100] mr-1 w-[min(18rem,calc(100vw-2rem))] min-w-[12rem] rounded-lg border border-border-primary bg-bg-primary py-1 shadow-lg',
                        layout === 'toolbar' &&
                          'absolute left-full top-0 z-[100] ml-1 w-[min(18rem,calc(100vw-2rem))] min-w-[12rem] rounded-lg border border-border-primary bg-bg-primary py-1 shadow-lg',
                      )}
                    >
                      {REJECT_REASON_META.map(({ reason, label }) => (
                        <button
                          key={reason}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm leading-snug text-text-primary hover:bg-bg-secondary whitespace-normal"
                          onClick={() => openConfirm('reject', reason)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && !confirmLoading) {
            setConfirmOpen(false);
            setConfirmKind(null);
            setPendingRejectReason(null);
          }
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        tone={tone}
        loading={confirmLoading}
        onConfirm={handleConfirm}
      />
    </>
  );
}

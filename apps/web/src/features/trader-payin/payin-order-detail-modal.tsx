'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import type { AppealDto } from '@p2p/shared';
import { Modal } from '@/components/ui/modal';
import { DetailRow } from '@/components/ui/detail-row';
import { OrderIdCopyCell } from '@/components/ui/order-id-copy-cell';
import { PayInOrderStatus, AppealStatus, type TraderPayInOrderDto } from '@p2p/shared';
import { formatCurrency, formatDateFull } from '@/lib/utils';
import { payinOrderRequisiteSnapshot } from '@/lib/payin-requisite-snapshot';
import {
  OrderFinalizeDropdown,
  type OrderFinalizeMenuState,
} from './order-finalize-dropdown';
import {
  PayInAppealDecisionDropdown,
  type AppealDecisionMenuState,
} from './payin-appeal-decision-dropdown';
import type { FinalizeKind } from './payin-types';
import { CountdownTimer, PayInOrderStatusColumnCell } from './payin-order-cells';

export function PayInOrderDetailModal({
  selectedOrder,
  historyMode,
  clockOffsetMs = 0,
  onClose,
  finalizeMenu,
  setFinalizeMenu,
  appealDecisionMenu,
  setAppealDecisionMenu,
  resolveAppealMutation,
  onPickFinalizeKind,
  onOpenReceipts,
}: {
  selectedOrder: TraderPayInOrderDto | null;
  historyMode: boolean;
  clockOffsetMs?: number;
  onClose: () => void;
  finalizeMenu: OrderFinalizeMenuState;
  setFinalizeMenu: (state: OrderFinalizeMenuState) => void;
  appealDecisionMenu: AppealDecisionMenuState;
  setAppealDecisionMenu: (state: AppealDecisionMenuState) => void;
  resolveAppealMutation: Pick<
    UseMutationResult<
      AppealDto,
      unknown,
      { appealId: string; decision: AppealStatus },
      unknown
    >,
    'mutate' | 'isPending' | 'variables'
  >;
  onPickFinalizeKind: (kind: FinalizeKind, order: TraderPayInOrderDto) => void;
  onOpenReceipts: (order: TraderPayInOrderDto) => void;
}) {
  return (
    <Modal open={!!selectedOrder} onClose={onClose} title="Pay-In Order Details" size="lg">
      {(() => {
        const order = selectedOrder;
        if (!order) return null;
        const snap = payinOrderRequisiteSnapshot(order);
        return (
        <div className="space-y-4">
          <div className="space-y-3">
            <DetailRow label="Order ID">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs leading-relaxed break-all text-text-primary">
                  {order.id}
                </span>
                <OrderIdCopyCell id={order.id} withToast label="Order ID" />
              </span>
            </DetailRow>

            <DetailRow label="Created" value={formatDateFull(order.created_at)} />

            {historyMode ? (
              <DetailRow
                label="Completion time"
                value={
                  order.completed_at != null ? formatDateFull(order.completed_at) : '—'
                }
              />
            ) : (
              <DetailRow label="Time to complete">
                <CountdownTimer
                  autocloseAt={order.autoclose_at}
                  createdAt={order.created_at}
                  status={order.status}
                  clockOffsetMs={clockOffsetMs}
                />
              </DetailRow>
            )}

            <DetailRow label="Payment amount">
              <div className="flex flex-col gap-0.5 leading-tight">
                <span className="text-sm font-semibold text-text-primary tabular-nums">
                  {formatCurrency(order.amount, order.currency)}
                </span>
                {order.amount_equivalent_usdt != null ? (
                  <span className="text-xs font-normal tabular-nums text-text-muted">
                    {order.amount_equivalent_usdt.toFixed(2)} USDT
                  </span>
                ) : null}
              </div>
            </DetailRow>

            <DetailRow label="Requisite type" value={snap.type ?? '—'} />
            <DetailRow label="Bank" value={snap.bank ?? '—'} />

            <DetailRow label="Requisite number">
              {snap.copyValue ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm leading-relaxed break-all text-text-primary">
                    {snap.copyValue}
                  </span>
                  <OrderIdCopyCell
                    id={snap.copyValue}
                    withToast
                    label="Requisite number"
                  />
                </span>
              ) : (
                <span className="text-sm text-text-muted">—</span>
              )}
            </DetailRow>

            <DetailRow label="Owner" value={snap.owner ?? '—'} />

            <DetailRow label="Status">
              <div className="flex justify-start">
                <PayInOrderStatusColumnCell row={order} onOpenReceipts={onOpenReceipts} />
              </div>
            </DetailRow>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border-primary pt-4">
            {(() => {
              const openAppeal = (order.appeals ?? []).find((a) => a.status === AppealStatus.OPEN);
              const showAppealActions =
                order.status === PayInOrderStatus.APPEAL && openAppeal !== undefined;
              const appealBusy =
                resolveAppealMutation.isPending &&
                resolveAppealMutation.variables?.appealId === openAppeal?.id;

              return (
                <>
                  {showAppealActions && (
                    <PayInAppealDecisionDropdown
                      orderId={order.id}
                      appealId={openAppeal!.id}
                      menuState={appealDecisionMenu}
                      setMenuState={setAppealDecisionMenu}
                      menuAnchor="modal"
                      loading={appealBusy}
                      onReject={() =>
                        resolveAppealMutation.mutate({
                          appealId: openAppeal!.id,
                          decision: AppealStatus.REJECTED,
                        })
                      }
                      onAccept={() =>
                        resolveAppealMutation.mutate({
                          appealId: openAppeal!.id,
                          decision: AppealStatus.RESOLVED,
                        })
                      }
                    />
                  )}
                  <OrderFinalizeDropdown
                    order={order}
                    menuState={finalizeMenu}
                    setMenuState={setFinalizeMenu}
                    menuAnchor="modal"
                    onPickKind={(kind) => onPickFinalizeKind(kind, order)}
                  />
                </>
              );
            })()}
          </div>
        </div>
        );
      })()}
    </Modal>
  );
}

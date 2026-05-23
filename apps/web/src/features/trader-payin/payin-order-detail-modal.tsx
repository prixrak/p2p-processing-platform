'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import { CountdownTimer, PayInOrderStatusColumnCell } from './payin-order-cells';

function PayInOrderDetailBody({
  order,
  historyMode,
  clockOffsetMs,
  finalizeMenu,
  setFinalizeMenu,
  appealDecisionMenu,
  setAppealDecisionMenu,
  resolveAppealMutation,
  onOpenReceipts,
}: {
  order: TraderPayInOrderDto;
  historyMode: boolean;
  clockOffsetMs: number;
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
    'isPending' | 'variables'
  >;
  onOpenReceipts: (order: TraderPayInOrderDto) => void;
}) {
  const t = useTranslations('Trader.Payin.detail');
  const tPayin = useTranslations('Trader.Payin');
  const snap = payinOrderRequisiteSnapshot(order);
  const dash = tPayin('dash');

  const openAppeal = (order.appeals ?? []).find((a) => a.status === AppealStatus.OPEN);
  const showAppealActions =
    order.status === PayInOrderStatus.APPEAL && openAppeal !== undefined;
  const appealBusy =
    resolveAppealMutation.isPending &&
    resolveAppealMutation.variables?.appealId === openAppeal?.id;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <DetailRow label={t('orderId')}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs leading-relaxed break-all text-text-primary">
              {order.id}
            </span>
            <OrderIdCopyCell id={order.id} withToast label={t('orderId')} />
          </span>
        </DetailRow>

        <DetailRow label={t('created')} value={formatDateFull(order.created_at)} />

        {historyMode ? (
          <DetailRow
            label={t('completionTime')}
            value={order.completed_at != null ? formatDateFull(order.completed_at) : dash}
          />
        ) : (
          <DetailRow label={t('timeToComplete')}>
            <CountdownTimer
              autocloseAt={order.autoclose_at}
              createdAt={order.created_at}
              status={order.status}
              clockOffsetMs={clockOffsetMs}
            />
          </DetailRow>
        )}

        <DetailRow label={t('paymentAmount')}>
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

        <DetailRow label={t('requisiteType')} value={snap.type ?? dash} />
        <DetailRow label={t('bank')} value={snap.bank ?? dash} />

        <DetailRow label={t('requisiteNumber')}>
          {snap.copyValue ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm leading-relaxed break-all text-text-primary">
                {snap.copyValue}
              </span>
              <OrderIdCopyCell
                id={snap.copyValue}
                withToast
                label={t('requisiteNumber')}
              />
            </span>
          ) : (
            <span className="text-sm text-text-muted">{dash}</span>
          )}
        </DetailRow>

        <DetailRow label={t('owner')} value={snap.owner ?? dash} />
        <DetailRow label={t('cardHolderName')} value={snap.cardHolderName ?? dash} />

        <DetailRow label={t('status')}>
          <div className="flex justify-start">
            <PayInOrderStatusColumnCell row={order} onOpenReceipts={onOpenReceipts} />
          </div>
        </DetailRow>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border-primary pt-4">
        {showAppealActions && openAppeal ? (
          <PayInAppealDecisionDropdown
            orderId={order.id}
            appealId={openAppeal.id}
            menuState={appealDecisionMenu}
            setMenuState={setAppealDecisionMenu}
            menuAnchor="modal"
            loading={appealBusy}
          />
        ) : null}
        <OrderFinalizeDropdown
          order={order}
          menuState={finalizeMenu}
          setMenuState={setFinalizeMenu}
          menuAnchor="modal"
        />
      </div>
    </div>
  );
}

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
    'isPending' | 'variables'
  >;
  onOpenReceipts: (order: TraderPayInOrderDto) => void;
}) {
  const t = useTranslations('Trader.Payin.detail');

  return (
    <Modal open={!!selectedOrder} onClose={onClose} title={t('modalTitle')} size="lg">
      {selectedOrder ? (
        <PayInOrderDetailBody
          order={selectedOrder}
          historyMode={historyMode}
          clockOffsetMs={clockOffsetMs}
          finalizeMenu={finalizeMenu}
          setFinalizeMenu={setFinalizeMenu}
          appealDecisionMenu={appealDecisionMenu}
          setAppealDecisionMenu={setAppealDecisionMenu}
          resolveAppealMutation={resolveAppealMutation}
          onOpenReceipts={onOpenReceipts}
        />
      ) : null}
    </Modal>
  );
}

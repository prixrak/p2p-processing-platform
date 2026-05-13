import { Prisma } from '@prisma/client';
import type { AppealDto, OrderDto, PayInOrderStatus } from '@p2p/shared';
import {
  AppealStatus,
  payinTraderMarkupPercentPoints,
  PAYIN_TRADER_HISTORY_STATUSES,
} from '@p2p/shared';

const PAYIN_HISTORY_STATUS_SET = new Set<PayInOrderStatus>(PAYIN_TRADER_HISTORY_STATUSES);

function payinCompletionUnixSeconds(order: OrderWithRelations): number | null {
  if (order.completedAt) {
    return Math.floor(order.completedAt.getTime() / 1000);
  }
  const st = order.status as PayInOrderStatus;
  if (PAYIN_HISTORY_STATUS_SET.has(st)) {
    return Math.floor(order.updatedAt.getTime() / 1000);
  }
  return null;
}

/** Prisma include shape reused for pay-in order reads that map to `OrderDto`. */
export const ORDER_INCLUDE = {
  requisite: { include: { bank: true } },
  appeals: { include: { proofs: true } },
  currency: { select: { code: true } },
  forkChatProofs: true,
} as const;

export type OrderWithRelations = Prisma.PayinOrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

export function payinOrderToOrderDto(order: OrderWithRelations): OrderDto {
  const parserSnap =
    order.parserRate != null ? Number(order.parserRate) : null;
  const rtInSnap = order.rateTraderIn != null ? Number(order.rateTraderIn) : null;
  const payinTraderMarkupPercent =
    parserSnap != null && rtInSnap != null
      ? payinTraderMarkupPercentPoints(parserSnap, rtInSnap)
      : null;

  return {
    id: order.id,
    request_id: order.requestId,
    created_at: Math.floor(order.createdAt.getTime() / 1000),
    confirmed_at: order.confirmedAt
      ? Math.floor(order.confirmedAt.getTime() / 1000)
      : null,
    completed_at: payinCompletionUnixSeconds(order),
    autoclose_at: order.autocloseAt
      ? Math.floor(order.autocloseAt.getTime() / 1000)
      : null,
    currency: order.currency.code,
    amount: Number(order.amount),
    commission: Number(order.commission),
    partner_amount: Number(order.partnerAmount),
    commission_percent: Number(order.commissionPercent),
    payin_trader_markup_percent: payinTraderMarkupPercent,
    rate: Number(order.rate),
    status: order.status as PayInOrderStatus,
    requisite_number: order.requisite?.number ?? '',
    requisite_owner: order.requisite?.owner ?? '',
    bank: order.requisite?.bank?.name ?? '',
    redirect_url: order.redirectUrl,
    appeals: (order.appeals ?? []).map((a): AppealDto => ({
      id: a.id,
      status: a.status as AppealStatus,
      created_at: Math.floor(a.createdAt.getTime() / 1000),
      payin_order_id: order.id,
      order_amount: Number(order.amount),
      currency: order.currency.code,
      paid_amount: Number(a.paidAmount),
      requisite_number: order.requisite?.number ?? '',
      requisite_owner: order.requisite?.owner ?? '',
      bank: order.requisite?.bank?.name ?? '',
      proofs_of_payment: (a.proofs ?? []).map((p) => p.fileId),
    })),
    payment_detail: order.requisite
      ? {
          id: order.requisite.id,
          type: order.requisite.type,
          number: order.requisite.number,
          owner: order.requisite.owner,
          code: order.requisite.code ?? '',
          bank_name: order.requisite.bank?.name ?? '',
        }
      : null,
    trader_processing_method: order.traderProcessingMethod ?? null,
    fork_exchange_reference: order.forkExchangeReference ?? null,
    fork_chat_proof_file_ids: (order.forkChatProofs ?? []).map((p) => p.fileId),
  };
}

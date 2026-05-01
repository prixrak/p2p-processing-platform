import { Prisma } from '@prisma/client';
import type { AppealDto, OrderDto, PayInOrderStatus } from '@p2p/shared';
import { AppealStatus } from '@p2p/shared';

/** Prisma include shape reused for pay-in order reads that map to `OrderDto`. */
export const ORDER_INCLUDE = {
  requisite: { include: { bank: true } },
  appeals: { include: { proofs: true } },
  currency: { select: { code: true } },
} as const;

export type OrderWithRelations = Prisma.PayinOrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

export function payinOrderToOrderDto(order: OrderWithRelations): OrderDto {
  return {
    id: order.id,
    request_id: order.requestId,
    created_at: Math.floor(order.createdAt.getTime() / 1000),
    confirmed_at: order.confirmedAt
      ? Math.floor(order.confirmedAt.getTime() / 1000)
      : null,
    autoclose_at: order.autocloseAt
      ? Math.floor(order.autocloseAt.getTime() / 1000)
      : null,
    currency: order.currency.code,
    amount: Number(order.amount),
    commission: Number(order.commission),
    partner_amount: Number(order.partnerAmount),
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
  };
}

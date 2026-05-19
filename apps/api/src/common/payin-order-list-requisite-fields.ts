import type { TraderProcessingMethod } from '@prisma/client';

type RequisiteForList = {
  id: string;
  type: string;
  number: string;
  owner: string;
  cardHolderName: string;
  code: string | null;
  bank: { name: string } | null;
};

/**
 * Extra list-row fields for Pay-In orders (requisite snapshot for staff/merchant tables).
 */
export function payinOrderListRequisiteFields(
  traderProcessingMethod: TraderProcessingMethod | null | undefined,
  requisite: RequisiteForList | null | undefined,
): {
  payment_detail: {
    id: string;
    type: string;
    number: string;
    owner: string;
    card_holder_name: string;
    code: string;
    bank_name: string;
  } | null;
  trader_processing_method: TraderProcessingMethod | null;
} {
  if (!requisite) {
    return {
      payment_detail: null,
      trader_processing_method: traderProcessingMethod ?? null,
    };
  }
  return {
    payment_detail: {
      id: requisite.id,
      type: requisite.type,
      number: requisite.number,
      owner: requisite.owner,
      card_holder_name: requisite.cardHolderName ?? '',
      code: requisite.code ?? '',
      bank_name: requisite.bank?.name ?? '',
    },
    trader_processing_method: traderProcessingMethod ?? null,
  };
}

import type { OrderDto, PaymentDetailsShortDto } from '@p2p/shared';

/** Minimal row shape for the Pay-In requisite table cell (full `OrderDto` or staff list rows). */
export type PayinRequisiteListRow = {
  payment_detail?: PaymentDetailsShortDto | null;
  requisite_number?: string;
  requisite_owner?: string;
  requisite_card_holder_name?: string;
  bank?: string;
  trader_processing_method?: OrderDto['trader_processing_method'];
};

export type PayinRequisiteSnapshot = {
  /** Normalized number/account string for clipboard (spaces removed). */
  copyValue: string;
  /** Last four digits when `copyValue` contains digits; otherwise shortened fallback. */
  lastFourDisplay: string | null;
  owner: string | null;
  cardHolderName: string | null;
  bank: string | null;
  type: string | null;
  hasRequisite: boolean;
};

/**
 * Display/copy fields from `payment_detail` or order-level requisite fallbacks.
 */
export function payinOrderRequisiteSnapshot(row: PayinRequisiteListRow): PayinRequisiteSnapshot {
  const pd = row.payment_detail;
  const numberRaw = (pd?.number ?? row.requisite_number ?? '').trim();
  const copyValue = numberRaw.replace(/\s+/g, '');
  const digitsOnly = copyValue.replace(/\D/g, '');

  let lastFourDisplay: string | null = null;
  if (digitsOnly.length >= 4) {
    lastFourDisplay = digitsOnly.slice(-4);
  } else if (digitsOnly.length > 0) {
    lastFourDisplay = digitsOnly;
  } else if (copyValue.length >= 4) {
    lastFourDisplay = copyValue.slice(-4);
  } else if (copyValue.length > 0) {
    lastFourDisplay = copyValue;
  }

  const owner = (pd?.owner ?? row.requisite_owner ?? '').trim();
  const cardHolderName = (pd?.card_holder_name ?? row.requisite_card_holder_name ?? '').trim();
  const bank = (pd?.bank_name ?? row.bank ?? '').trim();
  const type = (pd?.type ?? row.trader_processing_method ?? '').trim();

  return {
    copyValue,
    lastFourDisplay,
    owner: owner || null,
    cardHolderName: cardHolderName || null,
    bank: bank || null,
    type: type || null,
    hasRequisite: copyValue.length > 0,
  };
}

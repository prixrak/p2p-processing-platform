/**
 * Maps staff trader profile API shapes into settlement UI state.
 * Handles both nested Prisma-style `{ currency: { code } }` and flat `{ currency: string }` rows.
 */

import { currencyCodeFromUnknown } from '@/lib/currency-code';

export type NormalizedTraderLedgerRow = {
  currency: string;
  ledger: number;
};

export type SettlementTraderLedgerSnapshot = {
  overdraftLimitUsdt: number;
  rows: NormalizedTraderLedgerRow[];
};

/** Balance row as returned by GET /api/traders/:id (profile) or similar. */
export type TraderProfileBalanceRow = {
  currency: unknown;
  amount: unknown;
};

export function currencyCodeFromBalanceRow(row: TraderProfileBalanceRow): string {
  return currencyCodeFromUnknown(row.currency);
}

/**
 * Maximum USDT DEBIT settlement amount the backend allows for this trader,
 * given current ledger USDT and overdraft limit (see settlements.service.ts).
 */
export function maxUsdtDebitAllowed(ledgerUsdt: number, overdraftLimitUsdt: number): number {
  return ledgerUsdt + overdraftLimitUsdt;
}

export function normalizeTraderApiProfileForSettlement(raw: {
  overdraftLimit?: unknown;
  balances?: TraderProfileBalanceRow[] | null;
}): SettlementTraderLedgerSnapshot {
  const overdraftLimitUsdt = Number(raw.overdraftLimit ?? 0);
  const rows = (raw.balances ?? [])
    .map((b) => ({
      currency: currencyCodeFromBalanceRow(b),
      ledger: Number(b.amount ?? 0),
    }))
    .filter((r) => r.currency.length > 0)
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return { overdraftLimitUsdt, rows };
}

export function ledgerAmountForCurrency(
  rows: NormalizedTraderLedgerRow[],
  currencyCode: string,
): number {
  const row = rows.find((r) => r.currency === currencyCode);
  return row?.ledger ?? 0;
}

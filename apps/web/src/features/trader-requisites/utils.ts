import { RequisiteType } from '@p2p/shared';
import { ibanInputMaxLength } from '@/lib/validation/iban-registry';
import type { PaymentMethodRow, RequisiteFormData } from './types';

/** API returns `currency.code` when the group includes the currency relation */
export function requisiteGroupCurrencyCode(
  currency: string | { code: string },
): string {
  return typeof currency === 'string' ? currency : currency.code;
}

/** Active catalog methods that accept Pay-In for the given ISO currency code. */
export function paymentMethodsForPayinCurrency(
  methods: PaymentMethodRow[],
  currencyCode: string,
): PaymentMethodRow[] {
  const code = currencyCode.trim().toUpperCase();
  return methods.filter((p) => {
    const cc = p.country?.currency?.code?.toUpperCase?.() ?? '';
    if (cc !== code) return false;
    return p.availability === 'PAYIN' || p.availability === 'BOTH';
  });
}

export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

/**
 * Parses a volume/breakdown numeric field: non-finite or negative values become 0.
 * Avoids NaN when API or cached payloads omit fields on a present `volume` object.
 */
export function volumePart(v: unknown): number {
  const n = num(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Headroom from limit and summed segments (completed + in processing). */
export function remainingFromLimitAndConsumed(limit: number, consumed: number): number {
  if (!(Number.isFinite(limit) && limit > 0)) return 0;
  const c = Number(consumed);
  const safeConsumed = Number.isFinite(c) && c >= 0 ? c : 0;
  return Math.max(0, limit - Math.min(safeConsumed, limit));
}

export function compactAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const CARD_PAN_MAX_DIGITS = 16;

/** Group card PAN as 4-digit blocks (spaces only; digits capped at 16). */
export function formatCardNumberInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, CARD_PAN_MAX_DIGITS);
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(' ');
}

/** Group IBAN as blocks of 4; length caps by country once the first two letters are known. */
export function formatIbanInput(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const max = ibanInputMaxLength(cleaned);
  const capped = cleaned.slice(0, max);
  const parts: string[] = [];
  for (let i = 0; i < capped.length; i += 4) {
    parts.push(capped.slice(i, i + 4));
  }
  return parts.join(' ');
}

export type RequisiteNumberFormatMode = 'card' | 'iban';

/** How many significant characters (digits or IBAN alnum) appear before the caret. */
export function requisiteSignificantBeforeCaret(
  raw: string,
  caret: number | null,
  mode: RequisiteNumberFormatMode,
): number {
  if (caret == null || caret <= 0) return 0;
  const slice = raw.slice(0, caret);
  if (mode === 'card') return slice.replace(/\D/g, '').length;
  return slice.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').length;
}

/** Caret position in `formatted` after the given number of significant characters. */
export function requisiteCaretAfterSignificant(
  formatted: string,
  significantCount: number,
  mode: RequisiteNumberFormatMode,
): number {
  if (significantCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i];
    const isSig =
      mode === 'card' ? /\d/.test(ch) : /[A-Z0-9]/.test(ch);
    if (isSig) {
      seen += 1;
      if (seen === significantCount) return i + 1;
    }
  }
  return formatted.length;
}

export const defaultRequisiteForm: RequisiteFormData = {
  type: RequisiteType.CARD,
  number: '',
  owner: '',
  card_holder_name: '',
  bank_id: '',
  accepts_other_banks: false,
  min_amount: 100,
  max_amount: 50000,
  limit_amount: 500000,
  limit_operations: 100,
};

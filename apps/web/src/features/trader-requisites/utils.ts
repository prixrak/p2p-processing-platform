import { RequisiteType } from '@p2p/shared';
import type { RequisiteFormData } from './types';

/** API returns `currency.code` when the group includes the currency relation */
export function requisiteGroupCurrencyCode(
  currency: string | { code: string },
): string {
  return typeof currency === 'string' ? currency : currency.code;
}

export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return Number(v);
}

export function compactAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export const defaultRequisiteForm: RequisiteFormData = {
  type: RequisiteType.CARD,
  number: '',
  owner: '',
  bank_id: '',
  accepts_other_banks: false,
  min_amount: 100,
  max_amount: 50000,
  limit_amount: 500000,
  limit_operations: 100,
};

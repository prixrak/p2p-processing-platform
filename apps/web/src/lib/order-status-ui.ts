import {
  PayInOrderStatus,
  PayOutOrderStatus,
  PAYIN_TRANSITIONS,
  PAYOUT_TRANSITIONS,
} from '@p2p/shared';
import { payinStatusVariant, payoutStatusVariant } from '@/lib/status-helpers';

export type FilterOption = { value: string; label: string };

function titleCaseWords(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Human-readable label for a Pay-In order status (enum value). */
export function payinStatusLabel(status: string): string {
  return titleCaseWords(status);
}

/** Human-readable label for a Pay-Out order status (enum value). */
export function payoutStatusLabel(status: string): string {
  return titleCaseWords(status);
}

/** API returns lowercase keys from Prisma (e.g. `canceled`); normalize for lookup. */
export function payinStatusLabelFromApiKey(key: string): string {
  return payinStatusLabel(key.toUpperCase());
}

const ALL_PAYIN = Object.values(PayInOrderStatus);
const ALL_PAYOUT = Object.values(PayOutOrderStatus);

export const payinStatusFilterOptions: FilterOption[] = [
  { value: '', label: 'All statuses' },
  ...ALL_PAYIN.map((s) => ({ value: s, label: payinStatusLabel(s) })),
];

export const payoutStatusFilterOptions: FilterOption[] = [
  { value: '', label: 'All statuses' },
  ...ALL_PAYOUT.map((s) => ({ value: s, label: payoutStatusLabel(s) })),
];

export function badgeVariantForPayin(status: string) {
  return payinStatusVariant[status] ?? 'default';
}

export function badgeVariantForPayout(status: string) {
  return payoutStatusVariant[status] ?? 'default';
}

/** Next statuses allowed by the domain state machine from current status. */
export function nextPayinStatuses(current: string): PayInOrderStatus[] {
  return PAYIN_TRANSITIONS[current as PayInOrderStatus] ?? [];
}

export function nextPayoutStatuses(current: string): PayOutOrderStatus[] {
  return PAYOUT_TRANSITIONS[current as PayOutOrderStatus] ?? [];
}

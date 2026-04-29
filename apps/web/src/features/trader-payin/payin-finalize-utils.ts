import { PayInOrderStatus } from '@p2p/shared';
import type { OrderDto } from '@p2p/shared';
import type { FinalizeKind } from './payin-types';

export function maskRequisite(numberRaw: string | null | undefined): string {
  if (!numberRaw) return '—';
  const trimmed = numberRaw.replace(/\s/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

export function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function finalizeTargetPreview(
  order: OrderDto,
  kind: FinalizeKind,
  actual?: number,
): string {
  const orderAmt = Number(order.amount);
  if (kind === 'paid') return 'Paid';
  if (kind === 'adjustment') {
    if (actual === undefined) return 'Adjusted (enter amount)';
    if (actual === orderAmt) return 'Paid';
    if (actual < orderAmt) return 'Underpaid';
    return 'Overpaid';
  }
  return 'Canceled';
}

/** Accent for the preview line describing the upcoming status label */
export function finalizePreviewTone(
  order: OrderDto,
  kind: FinalizeKind,
  adjustmentInput: string,
): string {
  if (kind === 'paid') return 'text-accent-green';
  if (kind === 'cancel') return 'text-accent-red';
  const actual = parsePositiveAmount(adjustmentInput);
  if (actual === null) return 'text-text-secondary';
  const o = Number(order.amount);
  if (actual === o) return 'text-accent-green';
  if (actual < o) return 'text-warning';
  return 'text-accent-purple';
}

export function finalizeOptionsForOrder(order: OrderDto): FinalizeKind[] {
  if (order.status === PayInOrderStatus.VERIFIED) {
    return ['paid', 'adjustment', 'cancel'];
  }
  if (order.status === PayInOrderStatus.NEW) {
    return ['cancel'];
  }
  if (order.status === PayInOrderStatus.CANCELED) {
    return ['paid', 'adjustment'];
  }
  return [];
}

export function orderPayinProofFileIds(row: OrderDto): string[] {
  const ids: string[] = [];
  for (const a of row.appeals ?? []) {
    for (const f of a.proofs_of_payment) ids.push(f);
  }
  return ids;
}

export function payinDirectionLabel(row: OrderDto): string {
  const t = row.payment_detail?.type;
  if (t === 'CARD' || t === 'IBAN') return t;
  return '—';
}

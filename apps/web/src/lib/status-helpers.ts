import type { PayInOrderStatus, PayOutOrderStatus } from '@p2p/shared';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'default';

export const payinStatusVariant: Record<string, BadgeVariant> = {
  NEW: 'info',
  PENDING: 'warning',
  VERIFIED: 'info',
  PROCESSING: 'warning',
  PAID: 'success',
  COMPLETED: 'success',
  CANCELED: 'danger',
  FAILED: 'danger',
  APPEAL: 'warning',
  UNDERPAID: 'warning',
  OVERPAID: 'warning',
  UPLOAD_FAILED: 'danger',
  NO_REQUISITE: 'danger',
};

export const payoutStatusVariant: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  NEW: 'info',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELED: 'danger',
  UPLOAD_FAILED: 'danger',
  NO_REQUISITE: 'danger',
};

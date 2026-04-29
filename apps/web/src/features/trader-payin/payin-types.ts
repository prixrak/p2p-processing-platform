import type { OrderDto } from '@p2p/shared';

export type FinalizeKind = 'paid' | 'adjustment' | 'cancel';

export interface FinalizeDialogState {
  order: OrderDto;
  kind: FinalizeKind;
  /** Raw input when kind is adjustment — actual received amount */
  adjustmentInput: string;
}

export interface PayInListApiResponse {
  items: OrderDto[];
  total: number;
  page: number;
  limit: number;
}

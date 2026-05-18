import type { TraderPayInOrderDto } from '@p2p/shared';

export type FinalizeKind = 'paid' | 'adjustment' | 'cancel';

export interface FinalizeDialogState {
  order: TraderPayInOrderDto;
  kind: FinalizeKind;
  /** Raw input when kind is adjustment — actual received amount */
  adjustmentInput: string;
}

export interface PayInListApiResponse {
  items: TraderPayInOrderDto[];
  total: number;
  page: number;
  limit: number;
}

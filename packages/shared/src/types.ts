import {
  PayInOrderStatus,
  PayOutOrderStatus,
  DetailsType,
  WebhookMethod,
  AppealStatus,
} from './enums';

export const PAYOUT_ORDER_REALTIME_EVENT_TYPE = 'payout_order_updated' as const;

/** Payload published over Redis and sent to SSE clients when a Pay-Out order changes. */
export interface PayOutOrderRealtimeEvent {
  type: typeof PAYOUT_ORDER_REALTIME_EVENT_TYPE;
  orderId: string;
  status: PayOutOrderStatus;
  traderId?: string | null;
  payoutTraderId?: string | null;
  merchantId: string;
  /** When true, public pool list may have changed (subscribe on payout:pool). */
  poolChanged?: boolean;
}

// --- Pay-In Models ---

export interface PaymentDetailsShortDto {
  id: string;
  type: string;
  number: string;
  owner: string;
  code: string;
  bank_name: string;
  acquiring_url?: string;
}

export interface AppealDto {
  id: string;
  status: AppealStatus;
  created_at: number;
  /** Pay-In order this appeal refers to */
  payin_order_id: string;
  /** Requested amount on the Pay-In order */
  order_amount: number;
  currency: string;
  /** Amount the payer reported sending (may differ from the order amount) */
  paid_amount: number;
  /** Payment requisite number/account from the order */
  requisite_number: string;
  /** Card/account holder name from requisite */
  requisite_owner: string;
  /** Bank label for the requisite, if any */
  bank: string;
  proofs_of_payment: string[];
}

export interface OrderDto {
  id: string;
  request_id: string;
  created_at: number;
  confirmed_at: number | null;
  /** Unix seconds when the order reached its current history outcome; legacy rows fall back to last update. */
  completed_at: number | null;
  autoclose_at: number | null;
  /** ISO currency code (e.g. UAH), matches the order in DB */
  currency: string;
  amount: number;
  commission: number;
  partner_amount: number;
  rate: number;
  status: PayInOrderStatus;
  requisite_number: string;
  requisite_owner: string;
  bank: string;
  redirect_url: string | null;
  appeals: AppealDto[];
  payment_detail: PaymentDetailsShortDto | null;
}

export interface OrderResponseDto {
  order: OrderDto;
  form_uri: string;
}

export const PAYIN_ORDER_REALTIME_EVENT_TYPE = 'payin_order_updated' as const;

/** Payload published over Redis and sent to SSE clients when a Pay-In order changes. */
export interface PayinOrderRealtimeEvent {
  type: typeof PAYIN_ORDER_REALTIME_EVENT_TYPE;
  orderId: string;
  status: PayInOrderStatus;
  /** When set, also published to the trader-wide channel. */
  traderId?: string | null;
  merchantId: string;
}

export interface H2HOrderResponseDto {
  order: OrderDto;
}

export interface PayInCheckAvailabilityResponseDto {
  request_id: string;
  available: boolean;
  amount: number;
  rounded_amount: number;
  currency: string;
  checked_at: number;
}

// --- Pay-Out Models ---

export interface DetailsDto {
  type: DetailsType;
  number: string;
  owner?: string;
  code?: string;
}

export interface PayOutOrderApiDto {
  id: string;
  request_id: string;
  created_at: number;
  start_at: number | null;
  end_at: number | null;
  currency: string;
  details: DetailsDto;
  amount: number;
  status: PayOutOrderStatus;
  rate: number;
  partner_amount: number;
  percent_fee: number;
  /** Pool routing: standard traders vs Pay-Out specialists (pool B). */
  pool_type?: 'STANDARD' | 'PAYOUT_SPECIALIST';
  /** Optional proof file uploaded when completing (cabinet). */
  completion_proof_file_id?: string;
  /** Unix seconds — when the order was routed to its current pool (A or B). */
  pool_assigned_at?: number | null;
  /** Parser fiat per 1 USDT at order creation (Pay-Out v2). */
  parser_rate?: number | null;
  /** Rough USDT face value: amount / parser_rate when parser_rate is set. */
  amount_usdt_estimate?: number | null;
  /** Payment method label for payout (cabinet lists). */
  payment_method_name?: string | null;
}

// --- Common Models ---

export interface DirectionBalanceDto {
  direction_name: string;
  min_amount: number;
  max_amount: number;
  rate: number;
  percent: number;
  online: boolean;
}

export interface ProfileDto {
  name: string;
  is_lock: boolean;
  balances: Record<string, number>;
  direction: DirectionBalanceDto;
}

export interface PaymentBankApiDto {
  id: number;
  name: string;
  logo_id: string;
}

// --- Webhook Models ---

export interface WebhookPayinDataDto {
  id: string;
  order_id: string;
  order_status: PayInOrderStatus;
  amount: number;
}

export interface WebhookPayoutDataDto {
  id: string;
  order_id: string;
  order_status: PayOutOrderStatus;
  amount: number;
}

export interface WebhookDto {
  method: WebhookMethod;
  timestamp: number;
  data: WebhookPayinDataDto | WebhookPayoutDataDto;
}

// --- Error Model ---

export interface ErrorDetails {
  timestamp: string;
  message: string;
  code: string;
  details: Record<string, unknown>;
}

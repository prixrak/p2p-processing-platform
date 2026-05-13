import {
  PayInOrderStatus,
  PayOutOrderStatus,
  PayoutTraderRejectReason,
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
  /** Unix seconds for the terminal history outcome; older rows without it use last update timestamp. */
  completed_at: number | null;
  autoclose_at: number | null;
  /** ISO currency code (e.g. UAH), matches the order in DB */
  currency: string;
  amount: number;
  commission: number;
  partner_amount: number;
  /**
   * Merchant Pay-In fee percent for this order (basis for `commission` and `partner_amount`).
   * Not the trader pay-in markup over the parser rate.
   */
  commission_percent: number;
  /**
   * Trader pay-in markup over parser P at assignment, in percent points (1 = 1%).
   * Null when parser snapshots were not recorded (historical orders / non-parser paths).
   */
  payin_trader_markup_percent: number | null;
  /** Compatibility rate field — prefer `commission_percent` and `payin_trader_markup_percent`. */
  rate: number;
  status: PayInOrderStatus;
  requisite_number: string;
  requisite_owner: string;
  bank: string;
  redirect_url: string | null;
  appeals: AppealDto[];
  payment_detail: PaymentDetailsShortDto | null;
  /** Routing snapshot when a trader requisite was assigned (null when unknown or unset). */
  trader_processing_method?: 'CARD' | 'FORK' | null;
  /** FORK: optional counterparty / exchange reference from the trader. */
  fork_exchange_reference?: string | null;
  /** FORK: file IDs for exchange chat screenshots (authorized download like appeal proofs). */
  fork_chat_proof_file_ids?: string[];
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
  /** Optional proof files when completing (cabinet). First id is mirrored in `completion_proof_file_id`. */
  completion_proof_file_ids?: string[];
  /** @deprecated Prefer `completion_proof_file_ids`; kept as first id when present. */
  completion_proof_file_id?: string;
  /** Unix seconds — when the order was routed to its current pool (A or B). */
  pool_assigned_at?: number | null;
  /**
   * When present, countdown target for pool SLA (admin-configured pool timeout).
   * Omitted or null if SLA is disabled.
   */
  pool_close_deadline_at?: number | null;
  /**
   * False for unassigned pool list payloads — recipient data must not be shown until the order is claimed.
   */
  requisites_visible?: boolean;
  /** Parser fiat per 1 USDT at order creation (Pay-Out v2). */
  parser_rate?: number | null;
  /** Rough USDT face value: amount / parser_rate when parser_rate is set. */
  amount_usdt_estimate?: number | null;
  /** Payment method label for payout (cabinet lists). */
  payment_method_name?: string | null;
  /** Set when the order was rejected by the trader/specialist (FAILED). */
  trader_reject_reason?: PayoutTraderRejectReason | null;
  /** Populated when rejection reason is OTHER. */
  trader_reject_other_note?: string | null;
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

// --- Cascade admin / staff cabinet ---

/**
 * Snapshot of cascade routing settings, mirroring the JSON returned from
 * `GET/PATCH /api/internal/admin/cascade/settings`.
 *
 * Shared between BE (controller response) and FE (admin/owner dashboards) so the
 * field names cannot drift apart.
 */
export interface CascadeSettings {
  autolimit_threshold: number;
  autolimit_enabled: boolean;
  fork_traffic_percent: number;
  card_traffic_percent: number;
  provider_traffic_percent: number;
  level_pick_mode: 'DEBT' | 'STOCHASTIC';
  payin_provider_integration_enabled: boolean;
  /** Optional Fork fill ladder; null = defaults in shared `cascade-logic`. */
  fill_multipliers_config: unknown | null;
}

/** Single row of the coverage nominal grid (TZ — admin manages this grid). */
export interface NominalRow {
  id: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
}

/**
 * Tier-1 method-share policy summary returned by `/admin/cascade/method-policy`.
 * `policy` and `assignment_note` are human-readable explanations of the share rule.
 */
export interface CascadeMethodPolicy {
  fork_traffic_percent: number;
  card_traffic_percent: number;
  provider_traffic_percent: number;
  method_share_sum_percent: number;
  matches_rule: boolean;
  fork_card_sum_percent: number;
  fork_card_split_matches_spec: boolean;
  policy: string;
  assignment_note: string;
}

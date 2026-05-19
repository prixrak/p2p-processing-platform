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
  /** Full legal name of the card/account holder (surname, given name, patronymic). */
  card_holder_name: string;
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
  /** Full legal name of the card/account holder from requisite */
  requisite_card_holder_name: string;
  /** Bank label for the requisite, if any */
  bank: string;
  proofs_of_payment: string[];
}

/**
 * Appeal payload on trader Pay-In cabinet APIs — proof file IDs and resolution actions only.
 */
export interface TraderPayInOrderAppealDto {
  id: string;
  status: AppealStatus;
  created_at: number;
  proofs_of_payment: string[];
}

/**
 * Trader Pay-In list/detail row — mirrors trader table columns only (no merchant economics or fork extras).
 */
export interface TraderPayInOrderDto {
  id: string;
  created_at: number;
  confirmed_at: number | null;
  completed_at: number | null;
  autoclose_at: number | null;
  currency: string;
  amount: number;
  amount_equivalent_usdt: number | null;
  status: PayInOrderStatus;
  requisite_number: string;
  requisite_owner: string;
  requisite_card_holder_name: string;
  bank: string;
  appeals: TraderPayInOrderAppealDto[];
  /** Receipts uploaded by the payer on the public payment page (not dispute appeals). */
  payer_payment_proof_file_ids: string[];
  payment_detail: PaymentDetailsShortDto | null;
  trader_processing_method?: 'CARD' | 'FORK' | null;
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
  /**
   * USDT equivalent of `amount` from captured quote snapshots at assignment time:
   * prefers trader snapshot (`rateTraderIn`, fiat per 1 USDT), else parser reference P (`parserRate`).
   * Null when neither snapshot exists (historical / non-parser flows).
   */
  amount_equivalent_usdt: number | null;
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
  requisite_card_holder_name: string;
  bank: string;
  redirect_url: string | null;
  appeals: AppealDto[];
  /** Payer payment receipts (payment page or merchant `update_order_with_proofs`), not dispute appeals. */
  payer_payment_proof_file_ids: string[];
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

export const TELEGRAM_LINKED_REALTIME_EVENT_TYPE = 'telegram_linked' as const;

/** Push to cabinet SSE when a Telegram chat is linked via the bot. */
export interface TelegramLinkedRealtimeEvent {
  type: typeof TELEGRAM_LINKED_REALTIME_EVENT_TYPE;
  chatId: string;
  isActive: boolean;
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

/** Recipient fields exposed in trader / specialist cabinets (table + detail modal). */
export interface PayOutCabinetDetailsDto {
  number: string;
  owner?: string;
}

/**
 * Pay-Out order payload for trader and specialist cabinets.
 * Omits merchant settlement fields (rate, fees, request_id, etc.).
 */
export interface PayOutOrderCabinetDto {
  id: string;
  created_at: number;
  start_at: number | null;
  currency: string;
  details: PayOutCabinetDetailsDto;
  amount: number;
  status: PayOutOrderStatus;
  completion_proof_file_ids?: string[];
  /** @deprecated Prefer `completion_proof_file_ids`; kept as first id when present. */
  completion_proof_file_id?: string;
  pool_close_deadline_at?: number | null;
  requisites_visible?: boolean;
  amount_usdt_estimate?: number | null;
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

/**
 * Global cascade snapshot bundled with staff requisite observability endpoints
 * (DEBT / STOCHASTIC context, credits, Redis snapshot amount).
 */
export interface CascadeStaffRequisitesContext {
  level_pick_mode: 'DEBT' | 'STOCHASTIC';
  fork_traffic_percent: number;
  card_traffic_percent: number;
  provider_traffic_percent: number;
  autolimit_enabled: boolean;
  autolimit_threshold: number;
  fork_credit: number;
  card_credit: number;
  provider_credit: number;
  /** When `level_pick_mode` is DEBT: which Fork/Card bucket wins the next tier-1 pick. */
  debt_primary_preview: 'FORK' | 'CARD' | null;
  /** Amount used when materializing ranks / eligibility in the cached Redis payload. */
  redis_rank_preview_amount: number;
  fill_config_fingerprint: string;
}

/** Staff row from GET `/admin/cascade/requisite-ratings` (Pay-In idle-time race diagnostics). */
export interface CascadeStaffRequisiteRatingRow {
  requisite_id: string;
  trader_id: string;
  trader_label: string;
  processing_method: string;
  requisite_masked: string;
  is_active: boolean;
  is_in_cascade_pool: boolean;
  fill_ratio: number;
  fill_ratio_tx: number;
  /** TZ fill display 0–100 (from amount fill), not race order */
  rating: number;
  weighted_score: number;
  idle_ms: number;
  confirmed_fill_ratio: number;
  fill_ladder_multiplier: number | null;
  fill_leg_multiplier: number | null;
  trader_multiplier: number;
  effective_race_multiplier: number;
  used_amount: number;
  limit_total_amount: number;
  used_ops: number;
  limit_total_ops: number;
  remaining_amount: number;
  manual_min_amount: number;
  manual_max_amount: number;
  effective_min: number | null;
  effective_max: number | null;
  autolimit_active: boolean;
  auto_min_amount: number | null;
  auto_max_amount: number | null;
  cascade_rank: number | null;
  is_eligible_preview: boolean;
  is_locked: boolean;
  last_assigned_at: string | null;
  last_assignment_order_id: string | null;
  assignments_count: number;
  composite_status: 'ACTIVE' | 'LOCKED' | 'INELIGIBLE' | 'DISABLED';
  autolimit_badge: boolean;
  fill_high: boolean;
}

/** Staff cascade: trader USDT headroom (balance + overdraft − pending Pay-In debits). */
export interface CascadeTraderUsdtCapacityRow {
  trader_id: string;
  trader_label: string;
  balance_usdt: number;
  overdraft_limit_usdt: number;
  pending_payin_debit_usdt: number;
  available_usdt: number;
  capacity_exhausted: boolean;
  low_capacity: boolean;
}

export interface CascadeStaffRequisiteRatingsResponse {
  currency: string;
  preview_amount: number | null;
  cascade_context: CascadeStaffRequisitesContext;
  rows: CascadeStaffRequisiteRatingRow[];
  /** Present for UAH when parser rate is available (USDT capacity enforcement active). */
  trader_usdt_capacity?: CascadeTraderUsdtCapacityRow[];
}

/** One slot in the ordered Pay-In cascade queue at a given amount. */
export interface CascadeAssignmentRankRow {
  rank: number;
  requisite_id: string;
  trader_id: string;
  trader_label: string;
  requisite_masked: string;
  assignment_level: 'FORK' | 'CARD';
  weighted_score: number;
}

export interface CascadeAssignmentTierGroup {
  level: 'FORK' | 'CARD';
  primary: boolean;
  ranks: CascadeAssignmentRankRow[];
}

export interface CascadeAssignmentExcludedRow {
  requisite_id: string;
  trader_id: string;
  trader_label: string;
  requisite_masked: string;
  processing_method: string;
  code: string;
  detail: string;
}

/** GET `/admin/cascade/assignment-explain` (detailed=true). */
export interface CascadeAssignmentExplainResponse {
  currency: string;
  /** Set when a specific `amount` was requested; null when evaluating all active coverage nominals. */
  amount: number | null;
  amount_source: 'requested' | 'all_nominals';
  primary_cascade_level: 'FORK' | 'CARD';
  cascade_context: CascadeStaffRequisitesContext;
  tiers: CascadeAssignmentTierGroup[];
  ranks: CascadeAssignmentRankRow[];
  excluded?: CascadeAssignmentExcludedRow[];
}

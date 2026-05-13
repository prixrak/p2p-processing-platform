export type CascadeSettings = {
  sliding_window_hours: number;
  autolimit_threshold: number;
  autolimit_enabled: boolean;
  card_rating_weight: number;
  fork_rating_weight: number;
  fork_traffic_percent: number;
  card_traffic_percent: number;
  provider_traffic_percent: number;
  level_pick_mode: 'DEBT' | 'STOCHASTIC';
  payin_provider_integration_enabled: boolean;
  /** Optional Fork fill ladder; null = defaults in shared `cascade-logic`. */
  fill_multipliers_config: unknown | null;
};

export type NominalRow = {
  id: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
};

export type CascadeMethodPolicy = {
  fork_traffic_percent: number;
  card_traffic_percent: number;
  provider_traffic_percent: number;
  method_share_sum_percent: number;
  matches_rule: boolean;
  fork_card_sum_percent: number;
  fork_card_split_matches_spec: boolean;
  policy: string;
  assignment_note: string;
};

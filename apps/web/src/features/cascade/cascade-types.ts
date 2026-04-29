export type CascadeSettings = {
  sliding_window_hours: number;
  autolimit_threshold: number;
  autolimit_enabled: boolean;
  card_rating_weight: number;
  fork_rating_weight: number;
};

export type NominalRow = {
  id: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
};

export type TrafficPercentPolicy = {
  active_traders_sum_percent: number;
  matches_rule: boolean;
  policy: string;
  assignment_note: string;
};

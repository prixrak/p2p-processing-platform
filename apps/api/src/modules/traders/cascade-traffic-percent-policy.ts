/**
 * Documented rules for Pay-In cascade traffic_percent (admin UX + API metadata).
 * English copy only (see AGENTS.md).
 */

export const CASCADE_TRAFFIC_PERCENT_POLICY_TEXT =
  'For every active trader with accepting orders enabled, configured traffic_percent values must sum to 100%, or all be 0 (the cascade then applies an equal split). API updates that would break this rule are rejected.';

export const CASCADE_TRAFFIC_PERCENT_ASSIGNMENT_NOTE =
  'When assigning a Pay-In, only traders with at least one eligible requisite for the requested amount compete; their configured shares are normalized within that eligible subset.';

export type TrafficPercentPolicySummary = {
  /** Sum of traffic_percent for traders where is_active and accepting_orders (platform-wide targets). */
  active_traders_sum_percent: number;
  /** Whether the sum satisfies the 100% or all-zero rule (same check as PATCH validation). */
  matches_rule: boolean;
  policy: string;
  assignment_note: string;
};

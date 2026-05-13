/**
 * Documented rules for Pay-In cascade method-level shares (TZ v3.1). English copy only (see AGENTS.md).
 */

export const CASCADE_METHOD_LEVEL_POLICY_TEXT =
  'Each Pay-In first rolls only between Fork and Card using the configured Fork% and Card% (they should total ~100%). Inside the chosen tier, the requisite with the highest idle-time race score wins. If no requisite fits on that tier, the flow tries the other trader tier, then the external provider bridge as a last resort. Fork score uses confirmed-fill multipliers and a newcomer floor; Card uses the trader multiplier only.';

export const CASCADE_METHOD_LEVEL_ASSIGNMENT_NOTE =
  'DEBT mode tracks Fork/Card credits from the normalized Fork+Card split (Provider share does not pick the first tier). STOCHASTIC mode draws Fork vs Card per request. Level credits are debited from the primary Fork/Card bucket for that assignment, even when a fallback requisite on the other tier is used. Provider traffic percentage is bookkeeping only—it does not bypass Fork/Card for the primary attempt when integration is enabled.';

export type CascadeMethodPolicySummary = {
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

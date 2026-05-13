-- Remove superseded columns: global TZ v3.1 uses cascade_settings Fork/Card/Provider shares (not per-trader traffic_percent).

ALTER TABLE "cascade_settings"
  DROP COLUMN IF EXISTS "sliding_window_hours";

ALTER TABLE "cascade_settings"
  DROP COLUMN IF EXISTS "card_rating_weight";

ALTER TABLE "cascade_settings"
  DROP COLUMN IF EXISTS "fork_rating_weight";

ALTER TABLE "trader_profiles"
  DROP COLUMN IF EXISTS "traffic_percent";

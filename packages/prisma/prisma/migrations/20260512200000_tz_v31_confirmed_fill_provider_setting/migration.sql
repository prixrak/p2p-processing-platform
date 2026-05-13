-- TZ v3.1: confirmed Pay-In volume per requisite (PAID/UNDERPAID/OVERPAID) for cascade fill_multiplier.
ALTER TABLE "requisites"
ADD COLUMN IF NOT EXISTS "confirmed_payin_amount" DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- Stores fiat amount credited on paid outcomes for accurate reversal (e.g. APPEAL).
ALTER TABLE "payin_orders"
ADD COLUMN IF NOT EXISTS "received_fiat_amount" DECIMAL(18, 4);

CREATE INDEX IF NOT EXISTS "requisites_confirmed_payin_amount_idx" ON "requisites" ("confirmed_payin_amount");

-- Platform flag: when false, saving cascade provider_traffic_percent > 0 is rejected (TZ §5.5).
INSERT INTO "platform_settings" ("key", "value", "updated_at", "updated_by")
VALUES ('payin_provider_integration_enabled', 'false', NOW(), NULL)
ON CONFLICT ("key") DO NOTHING;

-- Primary cascade tier (debt/stochastic) vs landed tier on Pay-In create (analytics).
ALTER TABLE "traffic_distribution_logs"
ADD COLUMN IF NOT EXISTS "cascade_primary_assignment_level" "cascade_assignment_level";

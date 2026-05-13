-- Pay-In: external provider reference when routed to provider bridge (TZ §5–6).
ALTER TABLE "payin_orders"
ADD COLUMN IF NOT EXISTS "provider_external_ref" VARCHAR(512);

-- Assignment analytics: primary vs final tier, fallback flag, provider share plan (TZ §7.4, §5.4).
CREATE TABLE IF NOT EXISTS "payin_order_assignment_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payin_order_id" UUID NOT NULL,
    "amount" DECIMAL(18, 4) NOT NULL,
    "currency_code" VARCHAR(16) NOT NULL,
    "primary_bucket" "cascade_assignment_level" NOT NULL,
    "final_bucket" "cascade_assignment_level" NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "provider_traffic_plan_hit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payin_order_assignment_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payin_order_assignment_logs_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "payin_order_assignment_logs_payin_order_id_key"
ON "payin_order_assignment_logs" ("payin_order_id");

-- Optional JSON tiers for fill_multiplier (TZ §7.3); null = built-in defaults in app.
ALTER TABLE "cascade_settings"
ADD COLUMN IF NOT EXISTS "fill_multipliers_config" JSONB;

-- Cascade TZ v3.1: method-level routing credits, idle-based requisite ranking, trader multiplier.

CREATE TYPE "cascade_level_pick_mode" AS ENUM ('DEBT', 'STOCHASTIC');

CREATE TYPE "cascade_assignment_level" AS ENUM ('FORK', 'CARD', 'PROVIDER');

-- Trader cascade rating speed multiplier (idle race).
ALTER TABLE "trader_profiles"
ADD COLUMN "cascade_rating_multiplier" DECIMAL(12, 6) NOT NULL DEFAULT 1;

-- Requisite idle anchor for Pay-In cascade race; assignments count for newcomer boost.
ALTER TABLE "requisites"
ADD COLUMN "cascade_idle_anchor_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "payin_assignments_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "requisites" SET "cascade_idle_anchor_at" = "created_at";

-- Global method shares + primary level selection mode.
ALTER TABLE "cascade_settings"
ADD COLUMN "fork_traffic_percent" DECIMAL(8, 4) NOT NULL DEFAULT 70,
ADD COLUMN "card_traffic_percent" DECIMAL(8, 4) NOT NULL DEFAULT 30,
ADD COLUMN "provider_traffic_percent" DECIMAL(8, 4) NOT NULL DEFAULT 0,
ADD COLUMN "level_pick_mode" "cascade_level_pick_mode" NOT NULL DEFAULT 'DEBT';

UPDATE "cascade_settings"
SET
  "fork_traffic_percent" = 70,
  "card_traffic_percent" = 30,
  "provider_traffic_percent" = 0,
  "level_pick_mode" = 'DEBT';

ALTER TABLE "traffic_distribution_logs"
ADD COLUMN "cascade_assignment_level" "cascade_assignment_level";

CREATE TABLE "cascade_level_debts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "currency_id" UUID NOT NULL,
    "fork_credit" DECIMAL(24, 12) NOT NULL DEFAULT 0,
    "card_credit" DECIMAL(24, 12) NOT NULL DEFAULT 0,
    "provider_credit" DECIMAL(24, 12) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cascade_level_debts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cascade_level_debts_currency_id_key" ON "cascade_level_debts"("currency_id");

ALTER TABLE "cascade_level_debts" ADD CONSTRAINT "cascade_level_debts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

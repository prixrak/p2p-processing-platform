-- CreateEnum
CREATE TYPE "trader_processing_method" AS ENUM ('CARD', 'FORK');

-- AlterTable
ALTER TABLE "trader_profiles" ADD COLUMN "processing_method" "trader_processing_method" NOT NULL DEFAULT 'CARD',
ADD COLUMN "traffic_percent" DECIMAL(8, 4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cascade_settings" (
    "id" UUID NOT NULL,
    "sliding_window_hours" INTEGER NOT NULL DEFAULT 24,
    "autolimit_threshold" DECIMAL(8, 6) NOT NULL DEFAULT 0.20,
    "autolimit_enabled" BOOLEAN NOT NULL DEFAULT true,
    "card_rating_weight" INTEGER NOT NULL DEFAULT 100,
    "fork_rating_weight" INTEGER NOT NULL DEFAULT 150,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "cascade_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_distribution_logs" (
    "id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "payin_order_id" UUID NOT NULL,
    "amount" DECIMAL(18, 4) NOT NULL,
    "processing_method" "trader_processing_method" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_distribution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_nominal_settings" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(18, 4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_nominal_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traffic_distribution_logs_payin_order_id_key" ON "traffic_distribution_logs" ("payin_order_id");

-- CreateIndex
CREATE INDEX "traffic_distribution_logs_trader_id_created_at_idx" ON "traffic_distribution_logs" ("trader_id", "created_at");

-- CreateIndex
CREATE INDEX "coverage_nominal_settings_is_active_sort_order_idx" ON "coverage_nominal_settings" ("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "cascade_settings" ADD CONSTRAINT "cascade_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_distribution_logs" ADD CONSTRAINT "traffic_distribution_logs_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_distribution_logs" ADD CONSTRAINT "traffic_distribution_logs_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_nominal_settings" ADD CONSTRAINT "coverage_nominal_settings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed defaults (single settings row; nominals for coverage analytics / Fork auto_max)
INSERT INTO "cascade_settings" ("id", "sliding_window_hours", "autolimit_threshold", "autolimit_enabled", "card_rating_weight", "fork_rating_weight", "updated_at")
VALUES (gen_random_uuid(), 24, 0.20, true, 100, 150, NOW());

INSERT INTO "coverage_nominal_settings" ("id", "amount", "is_active", "sort_order")
VALUES
    (gen_random_uuid(), 300, true, 10),
    (gen_random_uuid(), 400, true, 20),
    (gen_random_uuid(), 500, true, 30),
    (gen_random_uuid(), 600, true, 40),
    (gen_random_uuid(), 700, true, 50),
    (gen_random_uuid(), 800, true, 60),
    (gen_random_uuid(), 900, true, 70),
    (gen_random_uuid(), 1000, true, 80),
    (gen_random_uuid(), 1200, true, 90),
    (gen_random_uuid(), 1500, true, 100),
    (gen_random_uuid(), 1800, true, 110),
    (gen_random_uuid(), 2000, true, 120),
    (gen_random_uuid(), 2500, true, 130),
    (gen_random_uuid(), 3000, true, 140),
    (gen_random_uuid(), 4000, true, 150),
    (gen_random_uuid(), 5000, true, 160);

-- Equal split of traffic_percent across existing traders (admins can rebalance later)
UPDATE "trader_profiles"
SET "traffic_percent" = ROUND((100.0 / tc.cnt)::numeric, 4)
FROM (SELECT COUNT(*)::numeric AS cnt FROM "trader_profiles") AS tc
WHERE tc.cnt > 0;

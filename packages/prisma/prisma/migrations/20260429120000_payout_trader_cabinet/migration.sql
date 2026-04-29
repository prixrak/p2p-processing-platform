-- Pay-Out specialist role, pool B routing, specialist balances and settlements.

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'PAYOUT_TRADER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "PayoutPoolType" AS ENUM ('STANDARD', 'PAYOUT_SPECIALIST');

CREATE TYPE "PayoutTraderBalanceTxType" AS ENUM (
  'PAYOUT_CREDIT',
  'SETTLEMENT_DEBIT',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT'
);

CREATE TABLE "payout_traders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "balance_usdt" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  "payout_rate" DECIMAL(8, 6) NOT NULL DEFAULT 0,
  "exchange_parser" VARCHAR(64),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_traders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_traders_user_id_key" ON "payout_traders"("user_id");

ALTER TABLE "payout_traders"
  ADD CONSTRAINT "payout_traders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payout_traders"
  ADD CONSTRAINT "payout_traders_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payout_pool_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pool_b_global_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "pool_timeout_hours" INTEGER,
  "pool_timeout_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" UUID,
  CONSTRAINT "payout_pool_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payout_pool_settings"
  ADD CONSTRAINT "payout_pool_settings_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "payout_pool_settings" ("id", "pool_b_global_percent")
VALUES ('00000000-0000-0000-0000-000000000001', 0);

CREATE TABLE "merchant_payout_pool_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "pool_b_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_payout_pool_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_payout_pool_assignments_merchant_id_key"
  ON "merchant_payout_pool_assignments"("merchant_id");

ALTER TABLE "merchant_payout_pool_assignments"
  ADD CONSTRAINT "merchant_payout_pool_assignments_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchant_payout_pool_assignments"
  ADD CONSTRAINT "merchant_payout_pool_assignments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payout_trader_balance_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payout_trader_id" UUID NOT NULL,
  "type" "PayoutTraderBalanceTxType" NOT NULL,
  "amount" DECIMAL(18, 6) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "reference_id" UUID,
  "created_by_id" UUID,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_trader_balance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payout_trader_balance_transactions_payout_trader_id_idx"
  ON "payout_trader_balance_transactions"("payout_trader_id");

CREATE INDEX "payout_trader_balance_transactions_created_at_idx"
  ON "payout_trader_balance_transactions"("created_at");

ALTER TABLE "payout_trader_balance_transactions"
  ADD CONSTRAINT "payout_trader_balance_transactions_payout_trader_id_fkey"
  FOREIGN KEY ("payout_trader_id") REFERENCES "payout_traders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payout_trader_balance_transactions"
  ADD CONSTRAINT "payout_trader_balance_transactions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payout_orders"
  ADD COLUMN "pool_type" "PayoutPoolType" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "payout_trader_id" UUID,
  ADD COLUMN "pool_assigned_at" TIMESTAMP(3);

ALTER TABLE "payout_orders"
  ADD CONSTRAINT "payout_orders_payout_trader_id_fkey"
  FOREIGN KEY ("payout_trader_id") REFERENCES "payout_traders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payout_orders_payout_trader_id_idx" ON "payout_orders"("payout_trader_id");

ALTER TABLE "settlements" DROP CONSTRAINT "settlements_trader_id_fkey";

ALTER TABLE "settlements" ALTER COLUMN "trader_id" DROP NOT NULL;

ALTER TABLE "settlements"
  ADD COLUMN "payout_trader_id" UUID,
  ADD COLUMN "usdt_address" VARCHAR(128);

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_trader_id_fkey"
  FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_payout_trader_id_fkey"
  FOREIGN KEY ("payout_trader_id") REFERENCES "payout_traders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "settlements_payout_trader_id_idx" ON "settlements"("payout_trader_id");

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_one_trader_participant" CHECK (
    ("trader_id" IS NOT NULL AND "payout_trader_id" IS NULL)
    OR ("trader_id" IS NULL AND "payout_trader_id" IS NOT NULL)
  );

-- Normalizes currency columns to currency_id (FK to currencies.id).
-- Backfill matches legacy string columns with currencies.code (case-insensitive, trimmed).

-- referral_profiles
ALTER TABLE "referral_profiles" ADD COLUMN "currency_id" UUID;
UPDATE "referral_profiles" AS r SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(r.currency)) = UPPER(c.code);
ALTER TABLE "referral_profiles" DROP COLUMN "currency";
ALTER TABLE "referral_profiles" ALTER COLUMN "currency_id" SET NOT NULL;
ALTER TABLE "referral_profiles" ADD CONSTRAINT "referral_profiles_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "referral_profiles_currency_id_idx" ON "referral_profiles"("currency_id");

-- merchant_balances
DROP INDEX IF EXISTS "merchant_balances_merchant_id_currency_key";
ALTER TABLE "merchant_balances" ADD COLUMN "currency_id" UUID;
UPDATE "merchant_balances" AS m SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(m.currency)) = UPPER(c.code);
ALTER TABLE "merchant_balances" DROP COLUMN "currency";
ALTER TABLE "merchant_balances" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE UNIQUE INDEX "merchant_balances_merchant_id_currency_id_key" ON "merchant_balances"("merchant_id", "currency_id");
ALTER TABLE "merchant_balances" ADD CONSTRAINT "merchant_balances_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- directions
ALTER TABLE "directions" ADD COLUMN "from_currency_id" UUID;
ALTER TABLE "directions" ADD COLUMN "to_currency_id" UUID;
UPDATE "directions" AS d SET "from_currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(d.from_currency)) = UPPER(c.code);
UPDATE "directions" AS d SET "to_currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(d.to_currency)) = UPPER(c.code);
ALTER TABLE "directions" DROP COLUMN "from_currency";
ALTER TABLE "directions" DROP COLUMN "to_currency";
ALTER TABLE "directions" ALTER COLUMN "from_currency_id" SET NOT NULL;
ALTER TABLE "directions" ALTER COLUMN "to_currency_id" SET NOT NULL;
CREATE INDEX "directions_from_currency_id_idx" ON "directions"("from_currency_id");
CREATE INDEX "directions_to_currency_id_idx" ON "directions"("to_currency_id");
ALTER TABLE "directions" ADD CONSTRAINT "directions_from_currency_id_fkey" FOREIGN KEY ("from_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "directions" ADD CONSTRAINT "directions_to_currency_id_fkey" FOREIGN KEY ("to_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- countries
ALTER TABLE "countries" ADD COLUMN "currency_id" UUID;
UPDATE "countries" AS co SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(co.currency)) = UPPER(c.code);
ALTER TABLE "countries" DROP COLUMN "currency";
ALTER TABLE "countries" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "countries_currency_id_idx" ON "countries"("currency_id");
ALTER TABLE "countries" ADD CONSTRAINT "countries_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payout_trader_balance_transactions
ALTER TABLE "payout_trader_balance_transactions" ADD COLUMN "currency_id" UUID;
UPDATE "payout_trader_balance_transactions" AS t SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(t.currency)) = UPPER(c.code);
ALTER TABLE "payout_trader_balance_transactions" DROP COLUMN "currency";
ALTER TABLE "payout_trader_balance_transactions" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "payout_trader_balance_transactions_currency_id_idx" ON "payout_trader_balance_transactions"("currency_id");
ALTER TABLE "payout_trader_balance_transactions" ADD CONSTRAINT "payout_trader_balance_transactions_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- merchant_directions
DROP INDEX IF EXISTS "merchant_directions_merchant_id_direction_type_currency_key";
ALTER TABLE "merchant_directions" ADD COLUMN "currency_id" UUID;
UPDATE "merchant_directions" AS md SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(md.currency)) = UPPER(c.code);
ALTER TABLE "merchant_directions" DROP COLUMN "currency";
ALTER TABLE "merchant_directions" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE UNIQUE INDEX "merchant_directions_merchant_id_direction_type_currency_id_key" ON "merchant_directions"("merchant_id", "direction_type", "currency_id");
CREATE INDEX "merchant_directions_currency_id_idx" ON "merchant_directions"("currency_id");
ALTER TABLE "merchant_directions" ADD CONSTRAINT "merchant_directions_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- balance_transactions
ALTER TABLE "balance_transactions" ADD COLUMN "currency_id" UUID;
UPDATE "balance_transactions" AS b SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(b.currency)) = UPPER(c.code);
ALTER TABLE "balance_transactions" DROP COLUMN "currency";
ALTER TABLE "balance_transactions" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "balance_transactions_currency_id_idx" ON "balance_transactions"("currency_id");
ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- trader_balances
DROP INDEX IF EXISTS "trader_balances_trader_id_currency_key";
ALTER TABLE "trader_balances" ADD COLUMN "currency_id" UUID;
UPDATE "trader_balances" AS tb SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(tb.currency)) = UPPER(c.code);
ALTER TABLE "trader_balances" DROP COLUMN "currency";
ALTER TABLE "trader_balances" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE UNIQUE INDEX "trader_balances_trader_id_currency_id_key" ON "trader_balances"("trader_id", "currency_id");
CREATE INDEX "trader_balances_currency_id_idx" ON "trader_balances"("currency_id");
ALTER TABLE "trader_balances" ADD CONSTRAINT "trader_balances_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- requisite_groups
ALTER TABLE "requisite_groups" ADD COLUMN "currency_id" UUID;
UPDATE "requisite_groups" AS rg SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(rg.currency)) = UPPER(c.code);
ALTER TABLE "requisite_groups" DROP COLUMN "currency";
ALTER TABLE "requisite_groups" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "requisite_groups_currency_id_idx" ON "requisite_groups"("currency_id");
ALTER TABLE "requisite_groups" ADD CONSTRAINT "requisite_groups_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- requisites
DROP INDEX IF EXISTS "requisites_currency_is_active_idx";
ALTER TABLE "requisites" ADD COLUMN "currency_id" UUID;
UPDATE "requisites" AS r SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(r.currency)) = UPPER(c.code);
ALTER TABLE "requisites" DROP COLUMN "currency";
ALTER TABLE "requisites" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "requisites_currency_id_is_active_idx" ON "requisites"("currency_id", "is_active");
ALTER TABLE "requisites" ADD CONSTRAINT "requisites_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payin_orders
ALTER TABLE "payin_orders" ADD COLUMN "currency_id" UUID;
UPDATE "payin_orders" AS po SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(po.currency)) = UPPER(c.code);
ALTER TABLE "payin_orders" DROP COLUMN "currency";
ALTER TABLE "payin_orders" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "payin_orders_currency_id_idx" ON "payin_orders"("currency_id");
ALTER TABLE "payin_orders" ADD CONSTRAINT "payin_orders_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payout_orders
ALTER TABLE "payout_orders" ADD COLUMN "currency_id" UUID;
UPDATE "payout_orders" AS po SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(po.currency)) = UPPER(c.code);
ALTER TABLE "payout_orders" DROP COLUMN "currency";
ALTER TABLE "payout_orders" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "payout_orders_currency_id_idx" ON "payout_orders"("currency_id");
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- settlements
ALTER TABLE "settlements" ADD COLUMN "currency_id" UUID;
UPDATE "settlements" AS s SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(s.currency)) = UPPER(c.code);
ALTER TABLE "settlements" DROP COLUMN "currency";
ALTER TABLE "settlements" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "settlements_currency_id_idx" ON "settlements"("currency_id");
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- merchant_balance_transactions
ALTER TABLE "merchant_balance_transactions" ADD COLUMN "currency_id" UUID;
UPDATE "merchant_balance_transactions" AS m SET "currency_id" = c.id FROM "currencies" AS c WHERE UPPER(TRIM(m.currency)) = UPPER(c.code);
ALTER TABLE "merchant_balance_transactions" DROP COLUMN "currency";
ALTER TABLE "merchant_balance_transactions" ALTER COLUMN "currency_id" SET NOT NULL;
CREATE INDEX "merchant_balance_transactions_currency_id_idx" ON "merchant_balance_transactions"("currency_id");
ALTER TABLE "merchant_balance_transactions" ADD CONSTRAINT "merchant_balance_transactions_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

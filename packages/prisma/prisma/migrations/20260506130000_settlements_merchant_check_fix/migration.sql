-- Merchant settlements use merchant_id with trader_id and payout_trader_id NULL.
-- The original constraint only allowed trader vs payout specialist.

ALTER TABLE "settlements" DROP CONSTRAINT "settlements_one_trader_participant";

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_one_trader_participant" CHECK (
  (
    "trader_id" IS NOT NULL
    AND "payout_trader_id" IS NULL
    AND "merchant_id" IS NULL
  )
  OR (
    "trader_id" IS NULL
    AND "payout_trader_id" IS NOT NULL
    AND "merchant_id" IS NULL
  )
  OR (
    "trader_id" IS NULL
    AND "payout_trader_id" IS NULL
    AND "merchant_id" IS NOT NULL
  )
);

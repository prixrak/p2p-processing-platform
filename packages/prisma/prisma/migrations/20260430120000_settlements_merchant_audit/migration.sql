-- Merchant settlement ledger entries + audited columns on settlements

ALTER TYPE "MerchantBalanceTransactionType" ADD VALUE 'SETTLEMENT';

ALTER TABLE "settlements" ADD COLUMN "merchant_id" UUID;
ALTER TABLE "settlements" ADD COLUMN "manual_rate" DECIMAL(18,8);
ALTER TABLE "settlements" ADD COLUMN "usdt_equivalent" DECIMAL(18,6);

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "settlements_merchant_id_idx" ON "settlements"("merchant_id");

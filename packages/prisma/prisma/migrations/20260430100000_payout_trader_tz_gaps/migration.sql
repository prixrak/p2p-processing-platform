-- Specialist fail policy: return order to pool B instead of FAILED + merchant refund
ALTER TABLE "payout_pool_settings"
  ADD COLUMN "specialist_fail_returns_to_pool" BOOLEAN NOT NULL DEFAULT false;

-- Pay-Out specialist settlement requests (cabinet → admin visibility)
CREATE TYPE "PayoutTraderSettlementRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');

CREATE TABLE "payout_trader_settlement_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payout_trader_id" UUID NOT NULL,
  "amount_usdt" DECIMAL(18, 6) NOT NULL,
  "note" TEXT,
  "status" "PayoutTraderSettlementRequestStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_id" UUID,
  CONSTRAINT "payout_trader_settlement_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payout_trader_settlement_requests_payout_trader_id_idx"
  ON "payout_trader_settlement_requests"("payout_trader_id");

CREATE INDEX "payout_trader_settlement_requests_status_idx"
  ON "payout_trader_settlement_requests"("status");

ALTER TABLE "payout_trader_settlement_requests"
  ADD CONSTRAINT "payout_trader_settlement_requests_payout_trader_id_fkey"
  FOREIGN KEY ("payout_trader_id") REFERENCES "payout_traders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payout_trader_settlement_requests"
  ADD CONSTRAINT "payout_trader_settlement_requests_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

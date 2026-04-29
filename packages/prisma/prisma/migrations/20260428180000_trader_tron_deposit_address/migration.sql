-- Per-trader TRC-20 USDT deposit address for on-chain monitoring (Block 5 §10).

ALTER TABLE "trader_profiles"
  ADD COLUMN "usdt_trc20_deposit_address" VARCHAR(64);

CREATE INDEX "trader_profiles_usdt_trc20_deposit_address_idx"
  ON "trader_profiles" ("usdt_trc20_deposit_address")
  WHERE "usdt_trc20_deposit_address" IS NOT NULL;

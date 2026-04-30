-- TZ Monitor/Sweep alignment: cumulative USDT deposits per trader; table name `deposits`.

ALTER TABLE "trader_balances" ADD COLUMN "total_deposited" DECIMAL(20, 6) NOT NULL DEFAULT 0;

ALTER TABLE "wallet_deposits" RENAME TO "deposits";

ALTER INDEX "wallet_deposits_trader_id_idx" RENAME TO "deposits_trader_id_idx";

ALTER INDEX "wallet_deposits_tx_hash_key" RENAME TO "deposits_tx_hash_key";

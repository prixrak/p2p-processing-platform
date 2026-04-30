-- TZ: Wallet Service / Sweep Scheduler — custodial TRON addresses and sweep audit log.

CREATE TYPE "WalletSweepStatus" AS ENUM ('PENDING', 'BROADCAST', 'CONFIRMED', 'FAILED');

CREATE TABLE "trader_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trader_id" UUID NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "derivation_index" INTEGER NOT NULL,
    "vault_path" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trader_wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_sweep_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trader_id" UUID NOT NULL,
    "from_address" VARCHAR(42) NOT NULL,
    "to_address" VARCHAR(42) NOT NULL,
    "tx_hash" VARCHAR(128),
    "amount_usdt" DECIMAL(20,6) NOT NULL,
    "fee_trx" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "status" "WalletSweepStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "wallet_sweep_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trader_wallets_trader_id_key" ON "trader_wallets"("trader_id");
CREATE UNIQUE INDEX "trader_wallets_address_key" ON "trader_wallets"("address");
CREATE UNIQUE INDEX "trader_wallets_derivation_index_key" ON "trader_wallets"("derivation_index");
CREATE INDEX "trader_wallets_address_idx" ON "trader_wallets"("address");

CREATE UNIQUE INDEX "wallet_sweep_logs_tx_hash_key" ON "wallet_sweep_logs"("tx_hash");
CREATE INDEX "wallet_sweep_logs_trader_id_idx" ON "wallet_sweep_logs"("trader_id");

ALTER TABLE "trader_wallets" ADD CONSTRAINT "trader_wallets_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_sweep_logs" ADD CONSTRAINT "wallet_sweep_logs_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_deposits" ADD COLUMN "to_address" VARCHAR(42);
ALTER TABLE "wallet_deposits" ADD COLUMN "block_number" BIGINT;

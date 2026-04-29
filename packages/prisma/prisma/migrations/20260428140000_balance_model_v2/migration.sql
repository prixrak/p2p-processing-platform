-- Balance model v2: parser-fixed rates, USDT trader ledger, UAH merchant, platform_income, exchange logs.

ALTER TABLE "trader_profiles"
  ADD COLUMN "overdraft_limit" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "payin_rate" DECIMAL(8, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "payout_rate" DECIMAL(8, 6) NOT NULL DEFAULT 0;

ALTER TABLE "payin_orders"
  ADD COLUMN "parser_rate" DECIMAL(12, 6),
  ADD COLUMN "rate_trader_in" DECIMAL(12, 6),
  ADD COLUMN "rate_admin_in" DECIMAL(12, 6);

ALTER TABLE "payout_orders"
  ADD COLUMN "parser_rate" DECIMAL(12, 6),
  ADD COLUMN "rate_trader_out" DECIMAL(12, 6),
  ADD COLUMN "rate_admin_out" DECIMAL(12, 6),
  ADD COLUMN "merchant_debit_uah" DECIMAL(18, 2);

CREATE TABLE "exchange_rate_logs" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rate"       DECIMAL(12, 6) NOT NULL,
  "raw_prices" JSONB NOT NULL,
  "source"     VARCHAR(64) NOT NULL DEFAULT 'binance_p2p',
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "exchange_rate_logs_created_at_idx" ON "exchange_rate_logs" ("created_at");

CREATE TYPE "PlatformIncomeOrderType" AS ENUM ('PAYIN', 'PAYOUT');

CREATE TABLE "platform_income" (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id"               UUID NOT NULL,
  "order_type"             "PlatformIncomeOrderType" NOT NULL,
  "merchant_id"            UUID NOT NULL REFERENCES "merchants" ("id"),
  "trader_id"              UUID REFERENCES "trader_profiles" ("id"),
  "order_amount_uah"       DECIMAL(18, 2) NOT NULL,
  "parser_rate"            DECIMAL(12, 6) NOT NULL,
  "rate_trader"            DECIMAL(12, 6) NOT NULL,
  "rate_admin"             DECIMAL(12, 6) NOT NULL,
  "trader_rate_pct"        DECIMAL(8, 6) NOT NULL,
  "merchant_commission_pct" DECIMAL(8, 6) NOT NULL,
  "income_usdt"            DECIMAL(18, 6) NOT NULL,
  "income_uah"             DECIMAL(18, 2) NOT NULL,
  "created_at"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_income_order_id_order_type_key" UNIQUE ("order_id", "order_type")
);

CREATE INDEX "platform_income_merchant_id_idx" ON "platform_income" ("merchant_id");
CREATE INDEX "platform_income_created_at_idx" ON "platform_income" ("created_at");

CREATE TYPE "MerchantBalanceTransactionType" AS ENUM (
  'PAYIN_CREDIT',
  'PAYOUT_DEBIT',
  'PAYOUT_REFUND',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'TOP_UP'
);

CREATE TABLE "merchant_balance_transactions" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id"  UUID NOT NULL REFERENCES "merchants" ("id") ON DELETE CASCADE,
  "type"         "MerchantBalanceTransactionType" NOT NULL,
  "amount"       DECIMAL(18, 2) NOT NULL,
  "currency"     TEXT NOT NULL,
  "reference_id" UUID,
  "comment"      TEXT,
  "created_at"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "merchant_balance_transactions_merchant_id_idx" ON "merchant_balance_transactions" ("merchant_id");
CREATE INDEX "merchant_balance_transactions_created_at_idx" ON "merchant_balance_transactions" ("created_at");

CREATE TYPE "BlockchainNetwork" AS ENUM ('TRC20', 'ERC20');

CREATE TYPE "WalletDepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CREDITED');

CREATE TABLE "wallet_deposits" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trader_id"      UUID NOT NULL REFERENCES "trader_profiles" ("id") ON DELETE CASCADE,
  "tx_hash"        VARCHAR(128) NOT NULL UNIQUE,
  "network"        "BlockchainNetwork" NOT NULL,
  "amount_usdt"    DECIMAL(18, 6) NOT NULL,
  "confirmations"  INTEGER NOT NULL DEFAULT 0,
  "status"         "WalletDepositStatus" NOT NULL DEFAULT 'PENDING',
  "credited_at"    TIMESTAMP,
  "created_at"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "wallet_deposits_trader_id_idx" ON "wallet_deposits" ("trader_id");

CREATE TABLE "platform_withdrawals" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "amount_usdt"          DECIMAL(18, 6) NOT NULL,
  "cold_wallet_address"  VARCHAR(128) NOT NULL,
  "network"              "BlockchainNetwork" NOT NULL,
  "tx_hash"              VARCHAR(128),
  "initiated_by"         UUID REFERENCES "users" ("id"),
  "note"                 TEXT,
  "created_at"           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TYPE "BalanceTransactionType" ADD VALUE 'PAYIN_DEBIT';
ALTER TYPE "BalanceTransactionType" ADD VALUE 'PAYOUT_CREDIT';
ALTER TYPE "BalanceTransactionType" ADD VALUE 'TOP_UP';
ALTER TYPE "BalanceTransactionType" ADD VALUE 'OVERDRAFT_SET';

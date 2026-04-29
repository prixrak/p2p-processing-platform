-- Optional completion proof (file) on Pay-Out orders
ALTER TABLE "payout_orders" ADD COLUMN "completion_proof_file_id" UUID;

ALTER TABLE "payout_orders"
  ADD CONSTRAINT "payout_orders_completion_proof_file_id_fkey"
  FOREIGN KEY ("completion_proof_file_id") REFERENCES "files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Pay-Out specialist Telegram settings (separate from trader telegram_settings)
CREATE TABLE "payout_trader_telegram_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payout_trader_id" UUID NOT NULL,
  "chat_id" TEXT,
  "notify_new_pool_order" BOOLEAN NOT NULL DEFAULT true,
  "notify_settlement" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "payout_trader_telegram_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_trader_telegram_settings_payout_trader_id_key"
  ON "payout_trader_telegram_settings"("payout_trader_id");

ALTER TABLE "payout_trader_telegram_settings"
  ADD CONSTRAINT "payout_trader_telegram_settings_payout_trader_id_fkey"
  FOREIGN KEY ("payout_trader_id") REFERENCES "payout_traders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

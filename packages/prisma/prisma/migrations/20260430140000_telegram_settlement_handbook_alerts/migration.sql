-- Trader Telegram: optional alerts aligned with settlements handbook section 1.3 (USDT capacity & top-ups).
ALTER TABLE "telegram_settings" ADD COLUMN "notify_low_payin_capacity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "telegram_settings" ADD COLUMN "notify_top_up_confirm" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "telegram_settings" ADD COLUMN "notify_payin_capacity_exhausted" BOOLEAN NOT NULL DEFAULT true;

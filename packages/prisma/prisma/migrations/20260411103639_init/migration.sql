-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRADER', 'ADMIN', 'SUPPORT', 'MERCHANT', 'OWNER');

-- CreateEnum
CREATE TYPE "ApiKeyDirection" AS ENUM ('PAYIN', 'PAYOUT');

-- CreateEnum
CREATE TYPE "DirectionType" AS ENUM ('PAYIN', 'PAYOUT');

-- CreateEnum
CREATE TYPE "RequisiteType" AS ENUM ('CARD', 'IBAN');

-- CreateEnum
CREATE TYPE "PayinStatus" AS ENUM ('PENDING', 'NEW', 'VERIFIED', 'PAID', 'UNDERPAID', 'OVERPAID', 'APPEAL', 'CANCELED', 'UPLOAD_FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'NEW', 'PROCESSING', 'COMPLETED', 'FAILED', 'UPLOAD_FAILED');

-- CreateEnum
CREATE TYPE "PayoutDetailsType" AS ENUM ('CARD', 'IBAN');

-- CreateEnum
CREATE TYPE "AppealStatusEnum" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WebhookOutboxStatusEnum" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DLQ');

-- CreateEnum
CREATE TYPE "WebhookMethodEnum" AS ENUM ('payin_update_status_order', 'payout_update_status_order');

-- CreateEnum
CREATE TYPE "SettlementTypeEnum" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "two_fa_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_lock" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_api_keys" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "direction" "ApiKeyDirection" NOT NULL,
    "public_key" TEXT NOT NULL,
    "secret_key_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_balances" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "merchant_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DirectionType" NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "min_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "max_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "percent_fee" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trader_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trader_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trader_balances" (
    "id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "trader_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisites" (
    "id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "type" "RequisiteType" NOT NULL,
    "number" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "bank_id" INTEGER,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "accepts_other_banks" BOOLEAN NOT NULL DEFAULT false,
    "min_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "max_amount" DECIMAL(18,4) NOT NULL DEFAULT 999999999,
    "limit_total_amount" DECIMAL(18,4) NOT NULL DEFAULT 999999999,
    "limit_total_ops" INTEGER NOT NULL DEFAULT 999999,
    "used_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "used_ops" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logo_file_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payin_orders" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "trader_id" UUID,
    "requisite_id" UUID,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "commission" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "partner_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "status" "PayinStatus" NOT NULL DEFAULT 'PENDING',
    "user_full_name" TEXT,
    "user_id_external" TEXT,
    "callback_url" TEXT,
    "redirect_url" TEXT,
    "autoclose_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "is_h2h" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payin_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_orders" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "trader_id" UUID,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "details_type" "PayoutDetailsType" NOT NULL,
    "details_number" TEXT NOT NULL,
    "details_owner" TEXT,
    "details_code" TEXT,
    "rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "partner_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "percent_fee" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "callback_url" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "payin_order_id" UUID NOT NULL,
    "paid_amount" DECIMAL(18,4) NOT NULL,
    "status" "AppealStatusEnum" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_proofs" (
    "id" UUID NOT NULL,
    "appeal_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "appeal_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_outbox" (
    "id" UUID NOT NULL,
    "payin_order_id" UUID,
    "payout_order_id" UUID,
    "method" "WebhookMethodEnum" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "callback_url" TEXT NOT NULL,
    "status" "WebhookOutboxStatusEnum" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL,
    "outbox_id" UUID NOT NULL,
    "callback_url" TEXT NOT NULL,
    "request_body" JSONB NOT NULL,
    "response_status" INTEGER,
    "response_body" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "type" "SettlementTypeEnum" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_settings" (
    "id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "chat_id" TEXT,
    "notify_payin" BOOLEAN NOT NULL DEFAULT false,
    "notify_payout" BOOLEAN NOT NULL DEFAULT false,
    "notify_appeals" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "telegram_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_user_id_key" ON "merchants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_api_keys_public_key_key" ON "merchant_api_keys"("public_key");

-- CreateIndex
CREATE INDEX "merchant_api_keys_public_key_idx" ON "merchant_api_keys"("public_key");

-- CreateIndex
CREATE INDEX "merchant_api_keys_merchant_id_direction_idx" ON "merchant_api_keys"("merchant_id", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_balances_merchant_id_currency_key" ON "merchant_balances"("merchant_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "trader_profiles_user_id_key" ON "trader_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trader_balances_trader_id_currency_key" ON "trader_balances"("trader_id", "currency");

-- CreateIndex
CREATE INDEX "requisites_trader_id_is_active_idx" ON "requisites"("trader_id", "is_active");

-- CreateIndex
CREATE INDEX "requisites_currency_is_active_idx" ON "requisites"("currency", "is_active");

-- CreateIndex
CREATE INDEX "payin_orders_status_idx" ON "payin_orders"("status");

-- CreateIndex
CREATE INDEX "payin_orders_merchant_id_idx" ON "payin_orders"("merchant_id");

-- CreateIndex
CREATE INDEX "payin_orders_trader_id_idx" ON "payin_orders"("trader_id");

-- CreateIndex
CREATE INDEX "payin_orders_created_at_idx" ON "payin_orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payin_orders_merchant_id_request_id_key" ON "payin_orders"("merchant_id", "request_id");

-- CreateIndex
CREATE INDEX "payout_orders_status_idx" ON "payout_orders"("status");

-- CreateIndex
CREATE INDEX "payout_orders_merchant_id_idx" ON "payout_orders"("merchant_id");

-- CreateIndex
CREATE INDEX "payout_orders_trader_id_idx" ON "payout_orders"("trader_id");

-- CreateIndex
CREATE INDEX "payout_orders_created_at_idx" ON "payout_orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_orders_merchant_id_request_id_key" ON "payout_orders"("merchant_id", "request_id");

-- CreateIndex
CREATE INDEX "appeals_payin_order_id_idx" ON "appeals"("payin_order_id");

-- CreateIndex
CREATE INDEX "webhook_outbox_status_next_retry_at_idx" ON "webhook_outbox"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "webhook_logs_outbox_id_idx" ON "webhook_logs"("outbox_id");

-- CreateIndex
CREATE INDEX "settlements_trader_id_idx" ON "settlements"("trader_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_settings_trader_id_key" ON "telegram_settings"("trader_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_api_keys" ADD CONSTRAINT "merchant_api_keys_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_balances" ADD CONSTRAINT "merchant_balances_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_profiles" ADD CONSTRAINT "trader_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_balances" ADD CONSTRAINT "trader_balances_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisites" ADD CONSTRAINT "requisites_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisites" ADD CONSTRAINT "requisites_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payin_orders" ADD CONSTRAINT "payin_orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payin_orders" ADD CONSTRAINT "payin_orders_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payin_orders" ADD CONSTRAINT "payin_orders_requisite_id_fkey" FOREIGN KEY ("requisite_id") REFERENCES "requisites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal_proofs" ADD CONSTRAINT "appeal_proofs_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal_proofs" ADD CONSTRAINT "appeal_proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_payout_order_id_fkey" FOREIGN KEY ("payout_order_id") REFERENCES "payout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "webhook_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_settings" ADD CONSTRAINT "telegram_settings_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

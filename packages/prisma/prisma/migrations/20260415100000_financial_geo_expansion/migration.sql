-- ============================================================
-- Migration: financial_geo_expansion
-- Adds: countries, payment_methods, merchant_directions,
--       merchant_commission_tiers, balance_transactions,
--       disabled_reason on requisites, and various small
--       field additions across existing tables.
-- ============================================================

-- ── New enums ────────────────────────────────────────────────

CREATE TYPE "PaymentMethodFlowType" AS ENUM ('P2P', 'P2C', 'CRYPTO');
CREATE TYPE "PaymentMethodRequisiteType" AS ENUM ('CARD', 'IBAN', 'WALLET');
CREATE TYPE "PaymentMethodAvailability" AS ENUM ('PAYIN', 'PAYOUT', 'BOTH');
CREATE TYPE "RequisiteDisabledReason" AS ENUM ('LIMIT_AMOUNT', 'LIMIT_TX', 'MANUAL');
CREATE TYPE "BalanceTransactionType" AS ENUM (
  'PAYIN_COMMISSION',
  'PAYOUT_DEBIT',
  'SETTLEMENT',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT'
);

-- ── countries ────────────────────────────────────────────────

CREATE TABLE "countries" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT         NOT NULL,
    "code"       VARCHAR(10)  NOT NULL,
    "currency"   VARCHAR(10)  NOT NULL,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- ── payment_methods ──────────────────────────────────────────

CREATE TABLE "payment_methods" (
    "id"              UUID                         NOT NULL DEFAULT gen_random_uuid(),
    "country_id"      UUID                         NOT NULL,
    "name"            TEXT                         NOT NULL,
    "display_name"    TEXT                         NOT NULL,
    "flow_type"       "PaymentMethodFlowType"      NOT NULL,
    "requisite_type"  "PaymentMethodRequisiteType" NOT NULL,
    "availability"    "PaymentMethodAvailability"  NOT NULL,
    "is_active"       BOOLEAN                      NOT NULL DEFAULT true,
    "created_at"      TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_methods_name_key" ON "payment_methods"("name");
CREATE INDEX "payment_methods_country_id_is_active_idx" ON "payment_methods"("country_id", "is_active");

ALTER TABLE "payment_methods"
    ADD CONSTRAINT "payment_methods_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── merchant_directions ──────────────────────────────────────

CREATE TABLE "merchant_directions" (
    "id"                       UUID             NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"              UUID             NOT NULL,
    "payment_method_id"        UUID,
    "direction_type"           "DirectionType"  NOT NULL,
    "currency"                 TEXT             NOT NULL,
    "min_amount"               DECIMAL(18,4)    NOT NULL DEFAULT 0,
    "max_amount"               DECIMAL(18,4)    NOT NULL DEFAULT 0,
    "default_commission_percent" DECIMAL(8,4)   NOT NULL DEFAULT 0,
    "is_active"                BOOLEAN          NOT NULL DEFAULT true,
    "created_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_directions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_directions_merchant_id_direction_type_currency_key"
    ON "merchant_directions"("merchant_id", "direction_type", "currency");
CREATE INDEX "merchant_directions_merchant_id_direction_type_idx"
    ON "merchant_directions"("merchant_id", "direction_type");

ALTER TABLE "merchant_directions"
    ADD CONSTRAINT "merchant_directions_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchant_directions"
    ADD CONSTRAINT "merchant_directions_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── merchant_commission_tiers ────────────────────────────────

CREATE TABLE "merchant_commission_tiers" (
    "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
    "merchant_direction_id" UUID          NOT NULL,
    "amount_from"           DECIMAL(18,4) NOT NULL,
    "amount_to"             DECIMAL(18,4),
    "commission_percent"    DECIMAL(8,4)  NOT NULL,

    CONSTRAINT "merchant_commission_tiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "merchant_commission_tiers_merchant_direction_id_idx"
    ON "merchant_commission_tiers"("merchant_direction_id");

ALTER TABLE "merchant_commission_tiers"
    ADD CONSTRAINT "merchant_commission_tiers_merchant_direction_id_fkey"
    FOREIGN KEY ("merchant_direction_id") REFERENCES "merchant_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── balance_transactions ─────────────────────────────────────

CREATE TABLE "balance_transactions" (
    "id"           UUID                    NOT NULL DEFAULT gen_random_uuid(),
    "trader_id"    UUID                    NOT NULL,
    "type"         "BalanceTransactionType" NOT NULL,
    "amount"       DECIMAL(18,4)           NOT NULL,
    "currency"     TEXT                    NOT NULL,
    "reference_id" UUID,
    "created_by_id" UUID,
    "comment"      TEXT,
    "created_at"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balance_transactions_trader_id_idx" ON "balance_transactions"("trader_id");
CREATE INDEX "balance_transactions_created_at_idx" ON "balance_transactions"("created_at");

ALTER TABLE "balance_transactions"
    ADD CONSTRAINT "balance_transactions_trader_id_fkey"
    FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balance_transactions"
    ADD CONSTRAINT "balance_transactions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Alter existing tables ────────────────────────────────────

-- users: last_login_at
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

-- merchant_api_keys: revoked_at
ALTER TABLE "merchant_api_keys" ADD COLUMN "revoked_at" TIMESTAMP(3);

-- requisites: disabled_reason + payment_method_id
ALTER TABLE "requisites"
    ADD COLUMN "disabled_reason"    "RequisiteDisabledReason",
    ADD COLUMN "payment_method_id"  UUID;

ALTER TABLE "requisites"
    ADD CONSTRAINT "requisites_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payin_orders: commission_percent + completed_at + payment_method_id
ALTER TABLE "payin_orders"
    ADD COLUMN "commission_percent" DECIMAL(8,4)  NOT NULL DEFAULT 0,
    ADD COLUMN "completed_at"       TIMESTAMP(3),
    ADD COLUMN "payment_method_id"  UUID;

ALTER TABLE "payin_orders"
    ADD CONSTRAINT "payin_orders_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payout_orders: commission_amount + payment_method_id
ALTER TABLE "payout_orders"
    ADD COLUMN "commission_amount"  DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "payment_method_id"  UUID;

ALTER TABLE "payout_orders"
    ADD CONSTRAINT "payout_orders_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

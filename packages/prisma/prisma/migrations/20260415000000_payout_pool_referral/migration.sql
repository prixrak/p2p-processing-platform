-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'REFERRAL';

-- AlterTable: add payout limits to trader_profiles
ALTER TABLE "trader_profiles"
  ADD COLUMN "payout_min_limit" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "payout_max_limit" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable: referral_profiles
CREATE TABLE "referral_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "referral_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_profiles_user_id_key" ON "referral_profiles"("user_id");

ALTER TABLE "referral_profiles"
  ADD CONSTRAINT "referral_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add referred_by_id to users
ALTER TABLE "users" ADD COLUMN "referred_by_id" UUID;

CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_referred_by_id_fkey"
  FOREIGN KEY ("referred_by_id") REFERENCES "referral_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

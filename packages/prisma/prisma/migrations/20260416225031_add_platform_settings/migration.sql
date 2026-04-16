-- AlterTable
ALTER TABLE "appeals" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "balance_transactions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "countries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT,
ALTER COLUMN "currency" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "merchant_commission_tiers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "merchant_directions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_methods" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "referral_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

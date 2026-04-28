-- Requisite groups: trader-defined pay-in groupings with optional catalog payment method link.
-- Existing requisites are backfilled into one default group per (trader_id, currency).

CREATE TABLE "requisite_groups" (
    "id" UUID NOT NULL,
    "trader_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "payment_method_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisite_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisite_groups_trader_id_archived_at_idx" ON "requisite_groups"("trader_id", "archived_at");

ALTER TABLE "requisite_groups" ADD CONSTRAINT "requisite_groups_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "trader_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "requisite_groups" ADD CONSTRAINT "requisite_groups_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "requisites" ADD COLUMN "requisite_group_id" UUID;

INSERT INTO "requisite_groups" ("id", "trader_id", "name", "currency", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), "trader_id", 'Default', "currency", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "requisites"
GROUP BY "trader_id", "currency";

UPDATE "requisites" AS r
SET "requisite_group_id" = g."id"
FROM "requisite_groups" AS g
WHERE r."trader_id" = g."trader_id"
  AND r."currency" = g."currency"
  AND g."name" = 'Default';

ALTER TABLE "requisites" DROP CONSTRAINT IF EXISTS "requisites_payment_method_id_fkey";

ALTER TABLE "requisites" DROP COLUMN "payment_method_id";

ALTER TABLE "requisites" ALTER COLUMN "requisite_group_id" SET NOT NULL;

CREATE INDEX "requisites_requisite_group_id_idx" ON "requisites"("requisite_group_id");

ALTER TABLE "requisites" ADD CONSTRAINT "requisites_requisite_group_id_fkey" FOREIGN KEY ("requisite_group_id") REFERENCES "requisite_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

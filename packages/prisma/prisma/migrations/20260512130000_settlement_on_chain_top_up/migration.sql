-- Nullable admin for worker-created trader TOP_UP settlements; link to wallet deposit.
ALTER TABLE "settlements" ALTER COLUMN "admin_id" DROP NOT NULL;

ALTER TABLE "settlements" ADD COLUMN "wallet_deposit_id" UUID;

CREATE UNIQUE INDEX "settlements_wallet_deposit_id_key" ON "settlements"("wallet_deposit_id");

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_wallet_deposit_id_fkey" FOREIGN KEY ("wallet_deposit_id") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: credited on-chain deposits already reflected as TOP_UP in balance_transactions.
INSERT INTO "settlements" (
  "id",
  "admin_id",
  "trader_id",
  "payout_trader_id",
  "merchant_id",
  "type",
  "amount",
  "currency_id",
  "manual_rate",
  "usdt_equivalent",
  "note",
  "usdt_address",
  "created_at",
  "wallet_deposit_id"
)
SELECT
  gen_random_uuid(),
  NULL,
  d."trader_id",
  NULL,
  NULL,
  'CREDIT'::"SettlementTypeEnum",
  d."amount_usdt",
  c."id",
  NULL,
  NULL,
  'On-chain deposit ' || d."tx_hash" || ' (' || d."network"::text || ')',
  NULL,
  COALESCE(d."credited_at", d."created_at"),
  d."id"
FROM "deposits" d
INNER JOIN "currencies" c ON c."code" = 'USDT'
WHERE d."status" = 'CREDITED'
  AND EXISTS (
    SELECT 1
    FROM "balance_transactions" bt
    WHERE bt."reference_id" = d."id"
      AND bt."type" = 'TOP_UP'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "settlements" s WHERE s."wallet_deposit_id" = d."id"
  );

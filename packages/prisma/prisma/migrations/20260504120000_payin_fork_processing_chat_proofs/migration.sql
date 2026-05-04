-- Pay-In snapshot of cascade method, FORK exchange reference, and chat proof attachments.

ALTER TABLE "payin_orders" ADD COLUMN "trader_processing_method" "trader_processing_method",
ADD COLUMN "fork_exchange_reference" VARCHAR(512);

CREATE TABLE "payin_fork_chat_proofs" (
    "id" UUID NOT NULL,
    "payin_order_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payin_fork_chat_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payin_fork_chat_proofs_payin_order_id_idx" ON "payin_fork_chat_proofs"("payin_order_id");

ALTER TABLE "payin_fork_chat_proofs" ADD CONSTRAINT "payin_fork_chat_proofs_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payin_fork_chat_proofs" ADD CONSTRAINT "payin_fork_chat_proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "payin_orders" o
SET "trader_processing_method" = l."processing_method"
FROM "traffic_distribution_logs" l
WHERE l."payin_order_id" = o."id"
  AND o."trader_processing_method" IS NULL;

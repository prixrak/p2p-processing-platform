-- Pay-Out: multiple completion proof files per order (cabinet).

CREATE TABLE "payout_completion_proof_attachments" (
    "id" UUID NOT NULL,
    "payout_order_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_completion_proof_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_completion_proof_attachments_payout_order_id_file_id_key"
  ON "payout_completion_proof_attachments"("payout_order_id", "file_id");

CREATE INDEX "payout_completion_proof_attachments_payout_order_id_idx"
  ON "payout_completion_proof_attachments"("payout_order_id");

ALTER TABLE "payout_completion_proof_attachments"
  ADD CONSTRAINT "payout_completion_proof_attachments_payout_order_id_fkey"
  FOREIGN KEY ("payout_order_id") REFERENCES "payout_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payout_completion_proof_attachments"
  ADD CONSTRAINT "payout_completion_proof_attachments_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "payout_completion_proof_attachments" ("id", "payout_order_id", "file_id", "created_at")
SELECT gen_random_uuid(), "id", "completion_proof_file_id", NOW()
FROM "payout_orders"
WHERE "completion_proof_file_id" IS NOT NULL;

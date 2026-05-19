-- Payer receipts from the public Pay-In payment page (separate from dispute appeals).

CREATE TABLE "payin_payer_payment_proofs" (
    "id" UUID NOT NULL,
    "payin_order_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payin_payer_payment_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payin_payer_payment_proofs_payin_order_id_idx" ON "payin_payer_payment_proofs"("payin_order_id");

ALTER TABLE "payin_payer_payment_proofs" ADD CONSTRAINT "payin_payer_payment_proofs_payin_order_id_fkey" FOREIGN KEY ("payin_order_id") REFERENCES "payin_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payin_payer_payment_proofs" ADD CONSTRAINT "payin_payer_payment_proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

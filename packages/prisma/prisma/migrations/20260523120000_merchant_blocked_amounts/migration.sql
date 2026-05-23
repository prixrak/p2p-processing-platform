-- Per-merchant-direction exact order amounts rejected at external API creation.
CREATE TABLE "merchant_blocked_amounts" (
    "id" UUID NOT NULL,
    "merchant_direction_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_blocked_amounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_blocked_amounts_merchant_direction_id_amount_key"
    ON "merchant_blocked_amounts"("merchant_direction_id", "amount");

CREATE INDEX "merchant_blocked_amounts_merchant_direction_id_idx"
    ON "merchant_blocked_amounts"("merchant_direction_id");

ALTER TABLE "merchant_blocked_amounts"
    ADD CONSTRAINT "merchant_blocked_amounts_merchant_direction_id_fkey"
    FOREIGN KEY ("merchant_direction_id") REFERENCES "merchant_directions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

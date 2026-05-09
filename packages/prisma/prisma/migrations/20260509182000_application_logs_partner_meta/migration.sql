-- Application logs: persist partner IP and external API path on order creation.

ALTER TABLE "payin_orders"
ADD COLUMN "partner_ip" VARCHAR(45),
ADD COLUMN "external_api_path" VARCHAR(512);

ALTER TABLE "payout_orders"
ADD COLUMN "partner_ip" VARCHAR(45),
ADD COLUMN "external_api_path" VARCHAR(512);

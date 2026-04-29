-- Geo-neutral column names: ledger amounts are in the order's fiat currency (UAH, KZT, ...).

ALTER TABLE "payout_orders" RENAME COLUMN "merchant_debit_uah" TO "merchant_debit_local";

ALTER TABLE "platform_income" RENAME COLUMN "order_amount_uah" TO "order_amount_local";

ALTER TABLE "platform_income" RENAME COLUMN "income_uah" TO "income_local";

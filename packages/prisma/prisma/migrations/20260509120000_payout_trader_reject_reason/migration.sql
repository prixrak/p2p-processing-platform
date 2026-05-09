-- Pay-Out: optional trader/specialist rejection reason when closing as FAILED (inactive card / refund scenario).

CREATE TYPE "PayoutTraderRejectReason" AS ENUM ('FOREIGN_CARD', 'CARD_REFUND_IN_PROGRESS', 'OTHER');

ALTER TABLE "payout_orders" ADD COLUMN "trader_reject_reason" "PayoutTraderRejectReason";

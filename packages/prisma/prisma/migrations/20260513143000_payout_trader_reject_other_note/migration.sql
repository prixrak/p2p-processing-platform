-- Free-text explanation when trader rejects with reason OTHER (required by cabinet UX).
ALTER TABLE "payout_orders" ADD COLUMN "trader_reject_other_note" TEXT;

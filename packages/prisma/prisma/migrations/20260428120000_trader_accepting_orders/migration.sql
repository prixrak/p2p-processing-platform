-- Trader self-service: pause receiving new Pay-In/Pay-Out assignments (distinct from admin is_active).
ALTER TABLE "trader_profiles" ADD COLUMN "accepting_orders" BOOLEAN NOT NULL DEFAULT true;

-- Per-trader Ethereum ERC-20 USDT deposit address (worker monitors incoming transfers).

ALTER TABLE "trader_profiles" ADD COLUMN "usdt_erc20_deposit_address" VARCHAR(42);

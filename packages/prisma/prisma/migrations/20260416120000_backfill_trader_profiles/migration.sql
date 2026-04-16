-- Users with role TRADER must have a trader_profiles row (owner list & trader API use this table).
INSERT INTO "trader_profiles" ("id", "user_id", "is_active", "payout_min_limit", "payout_max_limit", "created_at")
SELECT gen_random_uuid(), u."id", true, 0, 0, NOW()
FROM "users" u
WHERE u."role" = 'TRADER'
  AND NOT EXISTS (
    SELECT 1 FROM "trader_profiles" tp WHERE tp."user_id" = u."id"
  );

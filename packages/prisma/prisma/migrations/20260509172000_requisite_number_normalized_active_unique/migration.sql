-- Canonical normalized identifier for duplicate detection (aligned with @p2p/shared normalizeRequisiteIdentifier).

ALTER TABLE "requisites" ADD COLUMN "number_normalized" TEXT;

UPDATE "requisites"
SET "number_normalized" = CASE
  WHEN "type"::text = 'CARD' THEN regexp_replace("number", '\D', '', 'g')
  ELSE regexp_replace(upper(regexp_replace("number", '\s', '', 'g')), '[^A-Z0-9]', '', 'g')
END;

ALTER TABLE "requisites" ALTER COLUMN "number_normalized" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "type", "number_normalized", COUNT(*) AS cnt
      FROM "requisites"
      WHERE "is_active" = true
      GROUP BY "type", "number_normalized"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION 'Blocked migration: multiple active requisites share the same normalized number';
  END IF;
END $$;

CREATE UNIQUE INDEX "requisites_active_type_number_normalized_uidx"
ON "requisites" ("type", "number_normalized")
WHERE ("is_active" = true);

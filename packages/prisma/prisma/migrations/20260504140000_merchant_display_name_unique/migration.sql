-- Deduplicate merchant display names before adding a unique constraint (keep earliest row per name).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC, id ASC) AS rn
  FROM merchants
)
UPDATE merchants AS m
SET name = m.name || ' (' || SUBSTRING(m.id::text, 1, 8) || ')'
FROM ranked AS r
WHERE m.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX "merchants_name_key" ON "merchants"("name");

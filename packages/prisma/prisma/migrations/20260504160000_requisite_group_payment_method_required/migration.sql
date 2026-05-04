-- Backfill requisite_groups.payment_method_id using the first active Pay-In catalog method for the group's currency (via country).
UPDATE requisite_groups rg
SET payment_method_id = (
  SELECT pm.id
  FROM payment_methods pm
  INNER JOIN countries c ON c.id = pm.country_id AND c.currency_id = rg.currency_id
  WHERE pm.is_active = true
    AND pm.availability IN ('PAYIN'::"PaymentMethodAvailability", 'BOTH'::"PaymentMethodAvailability")
  ORDER BY pm.created_at ASC
  LIMIT 1
)
WHERE rg.payment_method_id IS NULL;

-- Orphan rows must be fixed manually before this migration can succeed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM requisite_groups WHERE payment_method_id IS NULL) THEN
    RAISE EXCEPTION 'requisite_groups still has NULL payment_method_id: add payment methods for those currencies or assign rows manually';
  END IF;
END $$;

ALTER TABLE "requisite_groups" ALTER COLUMN "payment_method_id" SET NOT NULL;

-- Direction.rate was unused for pricing; orders keep their own legacy rate column for API compatibility.
ALTER TABLE "directions" DROP COLUMN IF EXISTS "rate";

-- Requisites cannot stay active while their payment group is off.
UPDATE "requisites" r
SET
    "is_active" = FALSE,
    "disabled_reason" = 'MANUAL'
FROM "requisite_groups" g
WHERE r."requisite_group_id" = g."id"
  AND g."is_active" = FALSE
  AND r."is_active" = TRUE;

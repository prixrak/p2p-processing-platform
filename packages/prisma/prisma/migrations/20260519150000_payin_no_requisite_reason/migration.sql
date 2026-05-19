-- Pay-In NO_REQUISITE diagnostic reason (owner application logs / ops).

CREATE TYPE "PayinNoRequisiteReason" AS ENUM (
  'NO_ACTIVE_REQUISITES',
  'REQUISITE_TOTAL_LIMIT_EXCEEDED',
  'NO_MATCHING_AMOUNT_OR_RANGE',
  'USDT_CAPACITY_INSUFFICIENT',
  'PROVIDER_DECLINED',
  'PROVIDER_UNAVAILABLE',
  'ASSIGNMENT_CONTENTION'
);

ALTER TABLE "payin_orders"
  ADD COLUMN "no_requisite_reason" "PayinNoRequisiteReason",
  ADD COLUMN "no_requisite_detail" VARCHAR(512);

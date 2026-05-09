import { RequisiteType } from './enums';

/**
 * Canonical form for comparing requisites across cabinets (spaces/formatting ignored).
 * Must stay aligned with DB backfill in migrations.
 */
export function normalizeRequisiteIdentifier(type: RequisiteType, number: string): string {
  if (type === RequisiteType.CARD) {
    return number.replace(/\D/g, '');
  }
  return number.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

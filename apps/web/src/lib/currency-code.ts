/**
 * Normalizes currency fields from APIs that return either a plain code string or a nested
 * `{ code }` relation (common Prisma include shapes).
 */
export function currencyCodeFromUnknown(raw: unknown): string {
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t;
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'code' in raw &&
    typeof (raw as { code: unknown }).code === 'string'
  ) {
    return (raw as { code: string }).code.trim();
  }
  return '';
}

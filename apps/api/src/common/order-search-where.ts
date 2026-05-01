/** Standard UUID string form (PostgreSQL uuid type does not support `contains` / ILIKE). */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PayinPayoutOrderSearchOrOptions = {
  merchantNameContains?: boolean;
};

/**
 * Builds Prisma `OR` clauses for Pay-In / Pay-Out order list search.
 * Avoids invalid filters on UUID `id` unless the term is a full UUID (exact match).
 */
export function buildPayinPayoutOrderSearchOr(
  rawSearch: string,
  options?: PayinPayoutOrderSearchOrOptions,
): Record<string, unknown>[] {
  const term = rawSearch.trim();
  if (!term) return [];

  const or: Record<string, unknown>[] = [
    { requestId: { contains: term, mode: 'insensitive' as const } },
  ];

  if (options?.merchantNameContains) {
    or.push({
      merchant: { name: { contains: term, mode: 'insensitive' as const } },
    });
  }

  if (CANONICAL_UUID.test(term)) {
    or.unshift({ id: term });
  }

  return or;
}

/** Support appeals list: nested `payinOrder` filters with safe UUID handling. */
export function buildAppealPayinOrderSearchOr(rawSearch: string): Record<string, unknown>[] {
  const term = rawSearch.trim();
  if (!term) return [];

  const or: Record<string, unknown>[] = [
    {
      payinOrder: {
        requestId: { contains: term, mode: 'insensitive' as const },
      },
    },
    {
      payinOrder: {
        merchant: { name: { contains: term, mode: 'insensitive' as const } },
      },
    },
  ];

  if (CANONICAL_UUID.test(term)) {
    or.unshift({ payinOrder: { id: term } });
  }

  return or;
}

/** Standard UUID string form (PostgreSQL uuid type does not support `contains` / ILIKE). */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimum length for free-text list search (request id, names, etc.). Shorter terms are ignored unless UUID-like. */
export const MIN_ORDER_LIST_SEARCH_LEN = 2;

/**
 * Trims list search and drops overly short terms that would scan large tables with little benefit.
 * Keeps full UUIDs and partial hex prefixes (8+ chars) for id lookup.
 */
export function normalizeOrderListSearch(raw?: string): string | undefined {
  const term = typeof raw === 'string' ? raw.trim() : '';
  if (!term) return undefined;
  const compact = term.replace(/-/g, '');
  if (CANONICAL_UUID.test(term)) return term;
  if (/^[0-9a-f]{8,}$/i.test(compact)) return term;
  if (term.length < MIN_ORDER_LIST_SEARCH_LEN) return undefined;
  return term;
}

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
  const term = normalizeOrderListSearch(rawSearch) ?? '';
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

/** Trader / support appeals list: pay-in order id, request id, merchant name, requisite text. */
export function buildAppealListSearchOr(rawSearch: string): Record<string, unknown>[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
  if (!term) return [];

  const or: Record<string, unknown>[] = [
    ...buildAppealPayinOrderSearchOr(term),
    {
      payinOrder: {
        requisite: {
          OR: [
            { number: { contains: term, mode: 'insensitive' as const } },
            { owner: { contains: term, mode: 'insensitive' as const } },
            { cardHolderName: { contains: term, mode: 'insensitive' as const } },
          ],
        },
      },
    },
  ];

  if (CANONICAL_UUID.test(term)) {
    or.unshift({ id: term });
  }

  return or;
}

/** Support appeals list: nested `payinOrder` filters with safe UUID handling. */
export function buildAppealPayinOrderSearchOr(rawSearch: string): Record<string, unknown>[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
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

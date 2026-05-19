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

/** Distinct search variants for requisite / card matching (raw input plus normalized forms). */
export function orderListSearchVariants(rawSearch: string): string[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
  if (!term) return [];

  const variants = new Set<string>([term]);
  const digitsOnly = term.replace(/\D/g, '');
  if (digitsOnly.length >= MIN_ORDER_LIST_SEARCH_LEN) {
    variants.add(digitsOnly);
  }
  const alnumCompact = term
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (alnumCompact.length >= MIN_ORDER_LIST_SEARCH_LEN) {
    variants.add(alnumCompact);
  }
  return [...variants];
}

function buildRequestIdSearchOrClauses(variants: string[]): Record<string, unknown>[] {
  return variants.map((v) => ({
    requestId: { contains: v, mode: 'insensitive' as const },
  }));
}

function buildRequisiteFieldOrClauses(variants: string[]): Record<string, unknown>[] {
  const or: Record<string, unknown>[] = [];
  for (const v of variants) {
    or.push(
      { number: { contains: v, mode: 'insensitive' as const } },
      { numberNormalized: { contains: v, mode: 'insensitive' as const } },
      { owner: { contains: v, mode: 'insensitive' as const } },
      { cardHolderName: { contains: v, mode: 'insensitive' as const } },
    );
  }
  return or;
}

export function buildRequisiteRelationSearchFilter(variants: string[]): Record<string, unknown> {
  return { requisite: { OR: buildRequisiteFieldOrClauses(variants) } };
}

function buildPayoutRecipientFieldOrClauses(variants: string[]): Record<string, unknown>[] {
  const or: Record<string, unknown>[] = [];
  for (const v of variants) {
    or.push(
      { detailsNumber: { contains: v, mode: 'insensitive' as const } },
      { detailsOwner: { contains: v, mode: 'insensitive' as const } },
      { detailsCode: { contains: v, mode: 'insensitive' as const } },
    );
  }
  return or;
}

export type OrderListSearchOrOptions = {
  merchantNameContains?: boolean;
};

/**
 * Builds Prisma `OR` clauses for Pay-In order list search.
 * Avoids invalid filters on UUID `id` unless the term is a full UUID (exact match).
 */
export function buildPayinOrderSearchOr(
  rawSearch: string,
  options?: OrderListSearchOrOptions,
): Record<string, unknown>[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
  if (!term) return [];

  const variants = orderListSearchVariants(term);
  const or: Record<string, unknown>[] = [
    ...buildRequestIdSearchOrClauses(variants),
    buildRequisiteRelationSearchFilter(variants),
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

/**
 * Builds Prisma `OR` clauses for Pay-Out order list search.
 * Avoids invalid filters on UUID `id` unless the term is a full UUID (exact match).
 */
export function buildPayoutOrderSearchOr(
  rawSearch: string,
  options?: OrderListSearchOrOptions,
): Record<string, unknown>[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
  if (!term) return [];

  const variants = orderListSearchVariants(term);
  const or: Record<string, unknown>[] = [
    ...buildRequestIdSearchOrClauses(variants),
    ...buildPayoutRecipientFieldOrClauses(variants),
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

/** @deprecated Use {@link buildPayinOrderSearchOr} or {@link buildPayoutOrderSearchOr} for type-safe filters. */
export type PayinPayoutOrderSearchOrOptions = OrderListSearchOrOptions;

/** @deprecated Use {@link buildPayinOrderSearchOr} or {@link buildPayoutOrderSearchOr} for type-safe filters. */
export function buildPayinPayoutOrderSearchOr(
  rawSearch: string,
  options?: OrderListSearchOrOptions,
): Record<string, unknown>[] {
  return buildPayinOrderSearchOr(rawSearch, options);
}

/** Trader / support appeals list: pay-in order id, request id, merchant name, requisite text. */
export function buildAppealListSearchOr(rawSearch: string): Record<string, unknown>[] {
  const term = normalizeOrderListSearch(rawSearch) ?? '';
  if (!term) return [];

  const variants = orderListSearchVariants(term);
  const or: Record<string, unknown>[] = [
    ...buildAppealPayinOrderSearchOr(term),
    {
      payinOrder: {
        requisite: {
          OR: buildRequisiteFieldOrClauses(variants),
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

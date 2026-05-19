/** Mirrors API `MIN_ORDER_LIST_SEARCH_LEN` — avoid list queries on single-character noise. */
export const MIN_LIST_SEARCH_LENGTH = 2;

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns a search string safe to send as a list `search` query param, or `undefined` if the
 * debounced input is too short (unless it looks like an order/appeal id fragment).
 */
export function listSearchForQuery(debounced: string): string | undefined {
  const term = debounced.trim();
  if (!term) return undefined;
  const compact = term.replace(/-/g, '');
  if (CANONICAL_UUID.test(term)) return term;
  if (/^[0-9a-f]{8,}$/i.test(compact)) return term;
  if (term.length < MIN_LIST_SEARCH_LENGTH) return undefined;
  return term;
}

/** Client-side filter: case-insensitive substring plus digit-normalized match for card-like values. */
export function textMatchesListSearch(
  query: string,
  ...values: (string | null | undefined)[]
): boolean {
  const q = query.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  for (const raw of values) {
    const v = raw ?? '';
    if (v.toLowerCase().includes(lower)) return true;
    if (qDigits.length >= MIN_LIST_SEARCH_LENGTH && v.replace(/\D/g, '').includes(qDigits)) {
      return true;
    }
  }
  return false;
}

import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';

export interface CurrencyListItem {
  id: string;
  code: string;
  isActive: boolean;
}

export function normalizeCurrencyListResponse(
  raw: CurrencyListItem[] | { data?: CurrencyListItem[] } | unknown,
): CurrencyListItem[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === 'object' &&
    'data' in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: CurrencyListItem[] }).data;
  }
  return [];
}

export async function fetchCurrencyList(): Promise<CurrencyListItem[]> {
  const res = await api.get<CurrencyListItem[] | { data?: CurrencyListItem[] }>(
    internalPaths.currencies,
  );
  return normalizeCurrencyListResponse(res);
}

/** Invalidates TanStack caches used for currency dropdowns across staff cabinets. */
export function invalidateCurrencyListQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey;
      if (!Array.isArray(k) || k.length === 0) return false;
      if (k[0] === 'currencies') return true;
      return k[0] === 'owner' && k[1] === 'currencies';
    },
  });
}

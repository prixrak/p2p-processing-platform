import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';

/** React Query key roots — use factories below so currency list caches stay consistent. */
export const currencyKeys = {
  all: ['currencies'] as const,
  /** Normalized rows from GET /api/currencies (shared across dropdowns and catalog). */
  list: () => [...currencyKeys.all, 'list'] as const,
} as const;

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
  void queryClient.invalidateQueries({ queryKey: currencyKeys.all });
}

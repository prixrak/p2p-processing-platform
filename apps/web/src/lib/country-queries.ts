import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';

/** React Query keys for country list caches (owner geo + staff dropdowns). */
export const countryKeys = {
  ownerList: ['owner', 'countries'] as const,
  active: ['countries', 'active'] as const,
} as const;

export interface CountryListItem {
  id: string;
  name: string;
  code: string;
  currency: string;
  isActive: boolean;
  _count?: { paymentMethods: number };
}

/** Resolves API `currency` when it is either a code string or `{ code: string }`. */
export function currencyCodeFromRelation(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  if (value && typeof value === 'object' && 'code' in value && typeof (value as { code: unknown }).code === 'string')
    return (value as { code: string }).code.trim().toUpperCase();
  return '';
}

function parseCountryCount(raw: unknown): CountryListItem['_count'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const pm = (raw as { paymentMethods?: unknown }).paymentMethods;
  if (typeof pm === 'number') return { paymentMethods: pm };
  return undefined;
}

/** Maps GET /countries rows (nested `currency` or flat string currency code) into a stable UI shape. */
export function normalizeCountryListRow(raw: unknown): CountryListItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const name = typeof r.name === 'string' ? r.name : '';
  const code = typeof r.code === 'string' ? r.code : '';
  if (!id) return null;

  let currency = currencyCodeFromRelation(r.currency);
  if (!currency && typeof r.currencyCode === 'string') currency = r.currencyCode.trim().toUpperCase();

  const isActive = typeof r.isActive === 'boolean' ? r.isActive : true;

  const _count = parseCountryCount(r._count);

  return { id, name, code, currency, isActive, _count };
}

export async function fetchCountryList(opts?: { activeOnly?: boolean }): Promise<CountryListItem[]> {
  const path = opts?.activeOnly
    ? internalPaths.countriesQuery('activeOnly=true')
    : internalPaths.countries;
  const raw = await api.get<unknown>(path);
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((row) => normalizeCountryListRow(row))
    .filter((row): row is CountryListItem => row !== null);
}

/** Prefer API payload; attach `currency` when the create endpoint returns only IDs. */
export function mergeCreatedCountry(
  raw: unknown,
  dto: { name: string; code: string; currency: string },
): CountryListItem | null {
  const base = normalizeCountryListRow(raw);
  const cc = dto.currency.trim().toUpperCase();
  if (!base) {
    if (typeof raw !== 'object' || raw === null || !('id' in raw)) return null;
    const id = String((raw as { id: unknown }).id);
    if (!id) return null;
    return {
      id,
      name: dto.name.trim(),
      code: dto.code.trim().toUpperCase(),
      currency: cc,
      isActive: true,
      _count: { paymentMethods: 0 },
    };
  }
  return {
    ...base,
    currency: base.currency || cc,
    _count: base._count ?? { paymentMethods: 0 },
  };
}

/** Invalidates caches used when rendering country selects (owner geo + payout filters). */
export function invalidateCountryListQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: countryKeys.ownerList });
  void queryClient.invalidateQueries({ queryKey: countryKeys.active });
}

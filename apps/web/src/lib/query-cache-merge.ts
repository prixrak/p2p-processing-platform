import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { settlementKeys } from '@/lib/query-keys';

/** Shared shape for paginated list queries in the web app. */
export type PaginatedListCache<T = unknown> = {
  data: T[];
  total: number;
} & Partial<{ page: number; limit: number; totalPages: number }>;

export function matchesQueryKeyPrefix(
  queryKey: QueryKey,
  prefix: readonly unknown[],
): boolean {
  if (queryKey.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (queryKey[i] !== prefix[i]) return false;
  }
  return true;
}

/** Insert a new row into every matching paginated cache (page 1 trims to limit; other pages bump total only). */
export function mergeCreatedIntoPaginatedQueries<T extends { id: string }>(
  queryClient: QueryClient,
  options: {
    queryKeyPrefix: readonly unknown[];
    row: T;
    matchesQueryKey: (queryKey: readonly unknown[]) => boolean;
    getPageNumber: (queryKey: readonly unknown[]) => number | undefined;
    defaultLimit?: number;
  },
): void {
  const { queryKeyPrefix, row, matchesQueryKey, getPageNumber, defaultLimit } = options;
  const fallbackLimit = defaultLimit ?? 20;

  for (const q of queryClient.getQueryCache().findAll()) {
    const key = q.queryKey as readonly unknown[];
    if (!matchesQueryKeyPrefix(key, queryKeyPrefix)) continue;
    if (!matchesQueryKey(key)) continue;

    queryClient.setQueryData<PaginatedListCache<T> | undefined>(
      key as QueryKey,
      (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        if (old.data.some((item) => item.id === row.id)) return old;

        const limit = Math.max(old.limit ?? fallbackLimit, 1);
        const page = getPageNumber(key) ?? old.page ?? 1;
        const nextTotal = old.total + 1;
        const totalPages = Math.max(1, Math.ceil(nextTotal / limit));

        if (page === 1) {
          const merged = [row, ...old.data];
          return {
            ...old,
            data: merged.slice(0, limit),
            total: nextTotal,
            totalPages: old.totalPages !== undefined ? totalPages : undefined,
          };
        }

        return {
          ...old,
          total: nextTotal,
          totalPages: old.totalPages !== undefined ? totalPages : undefined,
        };
      },
    );
  }
}

export function patchEntitiesInPaginatedQueries<T extends { id: string }>(
  queryClient: QueryClient,
  options: {
    queryKeyPrefix: readonly unknown[];
    predicate?: (queryKey: readonly unknown[]) => boolean;
    mapRow: (existing: T) => T;
    whereId: string;
  },
): void {
  const { queryKeyPrefix, mapRow, whereId, predicate = () => true } = options;

  for (const q of queryClient.getQueryCache().findAll()) {
    const key = q.queryKey as readonly unknown[];
    if (!matchesQueryKeyPrefix(key, queryKeyPrefix)) continue;
    if (!predicate(key)) continue;

    queryClient.setQueryData<PaginatedListCache<T> | undefined>(
      key as QueryKey,
      (old) => {
        if (!old?.data?.length) return old;
        let changed = false;
        const data = old.data.map((row) => {
          if (row.id !== whereId) return row;
          changed = true;
          return mapRow(row);
        });
        return changed ? { ...old, data } : old;
      },
    );
  }
}

export function replaceEntityInPaginatedQueries<T extends { id: string }>(
  queryClient: QueryClient,
  options: {
    queryKeyPrefix: readonly unknown[];
    predicate?: (queryKey: readonly unknown[]) => boolean;
    next: T;
  },
): void {
  const { queryKeyPrefix, next, predicate = () => true } = options;
  patchEntitiesInPaginatedQueries(queryClient, {
    queryKeyPrefix,
    predicate,
    whereId: next.id,
    mapRow: () => next,
  });
}

export function upsertSortedArrayCache<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  row: T,
  options: {
    idOf: (item: T) => string;
    sort: (a: T, b: T) => number;
  },
): void {
  const { idOf, sort } = options;
  queryClient.setQueryData<T[]>(queryKey, (old) => {
    const prev = old ?? [];
    const filtered = prev.filter((x) => idOf(x) !== idOf(row));
    const next = [...filtered, row].sort(sort);
    return next;
  });
}

export function mergeIntoDataTotalList<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  row: T,
  options?: { prepend?: boolean; maxChunk?: number },
): void {
  const prepend = options?.prepend ?? true;
  const maxChunk = options?.maxChunk ?? 500;

  queryClient.setQueryData<{ data: T[]; total: number } | undefined>(
    queryKey,
    (old) => {
      if (!old) return old;
      const without = old.data.filter((x) => x.id !== row.id);
      const merged = prepend ? [row, ...without] : [...without, row];
      const wasNew = without.length === old.data.length;
      const nextData =
        merged.length > maxChunk ? merged.slice(0, maxChunk) : merged;
      return {
        data: nextData,
        total: Math.max(0, old.total + (wasNew ? 1 : 0)),
      };
    },
  );
}

// --- Settlements list cache (admin / owner) ---

export type SettlementListRow = {
  id: string;
  type: string;
  amount: unknown;
  currency: string;
  note?: string | null;
  createdAt: string;
  manualRate?: unknown;
  usdtEquivalent?: unknown;
  admin: { email: string } | null;
  trader: { id?: string; user: { email: string } } | null;
  payoutTrader: { id?: string; user: { email: string } } | null;
  merchant: { id?: string; name: string } | null;
  walletDeposit?: { txHash: string; network: string; status: string } | null;
};

export function normalizeSettlementListRow(raw: SettlementListRow): SettlementListRow {
  return {
    ...raw,
    trader:
      raw.trader && raw.trader.user
        ? { id: raw.trader.id, user: { email: raw.trader.user.email } }
        : null,
    payoutTrader:
      raw.payoutTrader && raw.payoutTrader.user
        ? { id: raw.payoutTrader.id, user: { email: raw.payoutTrader.user.email } }
        : null,
    merchant: raw.merchant ? { id: raw.merchant.id, name: raw.merchant.name } : null,
    walletDeposit: raw.walletDeposit ?? null,
  };
}

function settlementAmount(row: SettlementListRow): number {
  return Number(row.amount);
}

function settlementDatePrefix(iso: string): string {
  return iso.slice(0, 10);
}

function settlementMatchesParticipant(
  row: SettlementListRow,
  role: string,
  participantId: string,
): boolean {
  if (role === 'any' || !participantId.trim()) return true;
  if (role === 'trader') {
    const tid = row.trader?.id;
    return Boolean(tid && tid === participantId.trim());
  }
  if (role === 'payout') {
    const pid = row.payoutTrader?.id;
    return Boolean(pid && pid === participantId.trim());
  }
  if (role === 'merchant') {
    const mid = row.merchant?.id;
    return Boolean(mid && mid === participantId.trim());
  }
  return true;
}

export function adminSettlementListRowMatchesKey(
  row: SettlementListRow,
  key: readonly unknown[],
): boolean {
  if (key[0] !== 'admin' || key[1] !== 'settlements') return false;
  const participantRole = String(key[3] ?? 'any');
  const participantId = String(key[4] ?? '');
  const typeFilter = String(key[5] ?? 'ALL');
  const currency = String(key[6] ?? '').trim().toUpperCase();
  const dateFrom = String(key[7] ?? '');
  const dateTo = String(key[8] ?? '');
  const minAmount = String(key[9] ?? '').trim();
  const maxAmount = String(key[10] ?? '').trim();

  if (!settlementMatchesParticipant(row, participantRole, participantId)) return false;
  if (typeFilter !== 'ALL' && row.type !== typeFilter) return false;
  if (currency && row.currency.toUpperCase() !== currency) return false;

  const d = settlementDatePrefix(row.createdAt);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;

  const amt = settlementAmount(row);
  if (minAmount && amt < Number(minAmount)) return false;
  if (maxAmount && amt > Number(maxAmount)) return false;

  return true;
}

export function ownerSettlementListRowMatchesKey(
  row: SettlementListRow,
  key: readonly unknown[],
): boolean {
  if (key[0] !== 'owner' || key[1] !== 'settlements') return false;
  const tab = String(key[2] ?? 'ALL');
  const participantRole = String(key[4] ?? 'any');
  const participantId = String(key[5] ?? '');
  const currency = String(key[6] ?? '').trim().toUpperCase();
  const dateFrom = String(key[7] ?? '');
  const dateTo = String(key[8] ?? '');
  const minAmount = String(key[9] ?? '').trim();
  const maxAmount = String(key[10] ?? '').trim();

  if (tab !== 'ALL' && row.type !== tab) return false;
  if (!settlementMatchesParticipant(row, participantRole, participantId)) return false;
  if (currency && row.currency.toUpperCase() !== currency) return false;

  const d = settlementDatePrefix(row.createdAt);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;

  const amt = settlementAmount(row);
  if (minAmount && amt < Number(minAmount)) return false;
  if (maxAmount && amt > Number(maxAmount)) return false;

  return true;
}

export function getAdminSettlementPage(key: readonly unknown[]): number | undefined {
  if (key[0] !== 'admin' || key[1] !== 'settlements') return undefined;
  const p = Number(key[2]);
  return Number.isFinite(p) ? p : undefined;
}

export function getOwnerSettlementPage(key: readonly unknown[]): number | undefined {
  if (key[0] !== 'owner' || key[1] !== 'settlements') return undefined;
  const p = Number(key[3]);
  return Number.isFinite(p) ? p : undefined;
}

export function mergeSettlementIntoListCaches(
  queryClient: QueryClient,
  queryPrefix: 'admin' | 'owner',
  rawRow: SettlementListRow,
): void {
  const row = normalizeSettlementListRow(rawRow);
  if (queryPrefix === 'admin') {
    mergeCreatedIntoPaginatedQueries(queryClient, {
      queryKeyPrefix: settlementKeys.admin.scope,
      row,
      matchesQueryKey: (key) => adminSettlementListRowMatchesKey(row, key),
      getPageNumber: getAdminSettlementPage,
      defaultLimit: 50,
    });
  } else {
    mergeCreatedIntoPaginatedQueries(queryClient, {
      queryKeyPrefix: settlementKeys.owner.scope,
      row,
      matchesQueryKey: (key) => ownerSettlementListRowMatchesKey(row, key),
      getPageNumber: getOwnerSettlementPage,
      defaultLimit: 20,
    });
  }
}

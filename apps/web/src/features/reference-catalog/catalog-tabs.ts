export const REFERENCE_CATALOG_TAB_KEYS = ['currencies', 'banks', 'countries'] as const;

export type ReferenceCatalogTabKey = (typeof REFERENCE_CATALOG_TAB_KEYS)[number];

const TAB_SET = new Set<string>(REFERENCE_CATALOG_TAB_KEYS);

export function normalizeReferenceCatalogTab(
  tab: string | undefined,
): ReferenceCatalogTabKey {
  if (tab && TAB_SET.has(tab)) return tab as ReferenceCatalogTabKey;
  return 'currencies';
}

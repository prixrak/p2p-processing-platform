'use client';

import { Suspense, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/ui/tabs';
import { ListPageHeader } from '@/components/ui/list-page-tools';
import { CurrenciesPanel } from './currencies-panel';
import { BanksPanel } from './banks-panel';
import { CountriesPanel } from './countries-panel';
import { normalizeReferenceCatalogTab, type ReferenceCatalogTabKey } from './catalog-tabs';

const TAB_CONFIG: Array<{ key: ReferenceCatalogTabKey; label: string }> = [
  { key: 'currencies', label: 'Currencies' },
  { key: 'banks', label: 'Banks' },
  { key: 'countries', label: 'Countries' },
];

export function ReferenceCatalogPage({ initialTab }: { initialTab?: string }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading…</div>}>
      <ReferenceCatalogPageInner initialTab={initialTab} />
    </Suspense>
  );
}

function ReferenceCatalogPageInner({ initialTab }: { initialTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = useMemo(() => {
    const fromUrl = searchParams.get('tab') ?? undefined;
    return normalizeReferenceCatalogTab(fromUrl ?? initialTab);
  }, [searchParams, initialTab]);

  const tabsForUi = useMemo(
    () => TAB_CONFIG.map(({ key, label }) => ({ key, label })),
    [],
  );

  const onTabChange = (key: string) => {
    const next = normalizeReferenceCatalogTab(key);
    router.replace(`${pathname}?tab=${next}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <ListPageHeader
        title={<h1 className="text-2xl font-bold text-text-primary">Reference catalog</h1>}
        description="Currencies, banks, and countries for the platform"
        actions={<Tabs tabs={tabsForUi} active={tab} onChange={onTabChange} />}
      />

      <div className="pt-2">
        {tab === 'currencies' && <CurrenciesPanel />}
        {tab === 'banks' && <BanksPanel />}
        {tab === 'countries' && <CountriesPanel />}
      </div>
    </div>
  );
}

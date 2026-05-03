import { ReferenceCatalogPage } from '@/features/reference-catalog/reference-catalog-page';

export default async function OwnerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  return <ReferenceCatalogPage initialTab={sp.tab} />;
}

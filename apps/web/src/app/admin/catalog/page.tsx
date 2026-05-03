import { ReferenceCatalogPage } from '@/features/reference-catalog/reference-catalog-page';

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  return <ReferenceCatalogPage initialTab={sp.tab} />;
}

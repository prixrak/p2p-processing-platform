import { Suspense } from 'react';
import { TraderPayoutPage } from '@/features/trader-payout';

function mapSpecialistTab(tab: string | undefined): 'new' | 'in_progress' | 'history' {
  if (tab === 'history' || tab === 'in_progress') return tab;
  return 'new';
}

export default async function PayoutTraderOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading…</div>}>
      <TraderPayoutPage variant="specialist" initialTab={mapSpecialistTab(sp.tab)} />
    </Suspense>
  );
}

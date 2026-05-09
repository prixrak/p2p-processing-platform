'use client';

import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, ArrowUpFromLine } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { statCardToneAt } from '@/lib/surface-ring';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { specialistCabinetKeys } from '@/lib/query-keys';

interface SpecialistSummary {
  email: string;
  balance_usdt: number;
  payout_rate: number;
  country: { name: string; code: string; currency: string };
  is_active: boolean;
  exchange_parser: string | null;
  today_utc: {
    completed_count: number;
    completed_volume_fiat: number;
    failed_count: number;
    in_progress_count: number;
  };
}

export default function PayoutTraderDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: specialistCabinetKeys.summary(),
    queryFn: () => api.get<SpecialistSummary>(internalPaths.payoutSpecialistSummary),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-7 w-7 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pay-Out specialist</h1>
          <p className="text-sm text-text-muted">
            Pool B pay-outs for {data?.country?.name ?? 'your region'} ({data?.country?.currency ?? '—'})
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6" tone={statCardToneAt(0)}>
          <p className="text-sm font-medium text-text-muted">USDT balance</p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">
            {isLoading ? '…' : (data?.balance_usdt ?? 0).toFixed(2)} USDT
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Credited when you complete pay-outs. Request settlements from Balance; operators record
            them after transfer.
          </p>
        </Card>
        <Card className="p-6" tone={statCardToneAt(1)}>
          <p className="text-sm font-medium text-text-muted">Your rate</p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">
            {isLoading ? '…' : `${((data?.payout_rate ?? 0) * 100).toFixed(2)}%`}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Applied to completed pay-outs (same formula as standard traders).
          </p>
        </Card>
        <Card className="p-6" tone={statCardToneAt(2)}>
          <p className="text-sm font-medium text-text-muted">Completed today (UTC)</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {isLoading
              ? '…'
              : `${data?.today_utc?.completed_count ?? 0} · ${formatCurrency(
                  data?.today_utc?.completed_volume_fiat ?? 0,
                  data?.country?.currency ?? '',
                )}`}
          </p>
          <p className="mt-1 text-xs text-text-muted">Closed orders with end time in the current UTC day.</p>
        </Card>
        <Card className="p-6" tone={statCardToneAt(3)}>
          <p className="text-sm font-medium text-text-muted">Queue (UTC geo)</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {isLoading
              ? '…'
              : `${data?.today_utc?.in_progress_count ?? 0} active · ${data?.today_utc?.failed_count ?? 0} failed today`}
          </p>
          <p className="mt-1 text-xs text-text-muted">In progress is your NEW + PROCESSING workload.</p>
        </Card>
      </div>

      <Card className="p-6 flex flex-wrap items-center justify-between gap-4" tone={statCardToneAt(4)}>
        <div>
          <p className="font-medium text-text-primary">Working queue</p>
          <p className="text-sm text-text-muted">Take orders from your pool, then confirm or fail in Pay-Out.</p>
        </div>
        <Link href="/payout-trader/payout" className="inline-block">
          <Button>
            <ArrowUpFromLine className="h-4 w-4" />
            Open Pay-Out
          </Button>
        </Link>
      </Card>
    </div>
  );
}

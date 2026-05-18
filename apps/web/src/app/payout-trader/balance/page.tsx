'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { specialistCabinetKeys } from '@/lib/query-keys';
import { DataTable } from '@/components/ui/data-table';
import { formatDateTime } from '@/lib/utils';

interface SpecialistSummary {
  email: string;
  balance_usdt: number;
  payout_rate: number;
  country: { name: string; code: string; currency: string };
  is_active: boolean;
}

interface SettlementItem {
  id: string;
  type: string;
  amount: number;
  currency: string;
  note: string | null;
  usdt_address: string | null;
  created_at: string;
}

export default function PayoutTraderBalancePage() {
  const { data, isLoading } = useQuery({
    queryKey: specialistCabinetKeys.summary(),
    queryFn: () => api.get<SpecialistSummary>(internalPaths.payoutSpecialistSummary),
  });

  const { data: settlementPage, isLoading: settlementsLoading } = useQuery({
    queryKey: specialistCabinetKeys.settlements(1),
    queryFn: () =>
      api.get<{ items: SettlementItem[]; total: number }>(
        internalPaths.payoutSpecialistSettlements('page=1&limit=30'),
      ),
  });

  const settlementCols = [
    {
      key: 'type',
      header: 'Type',
      render: (row: SettlementItem) => (
        <span className="text-xs uppercase text-text-muted">{row.type}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end font-mono tabular-nums text-sm',
      render: (row: SettlementItem) => (
        <span>
          {row.amount.toLocaleString()} {row.currency}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (row: SettlementItem) => (
        <span className="text-xs text-text-secondary truncate max-w-[240px] block">{row.note ?? '—'}</span>
      ),
    },
    {
      key: 'usdt_address',
      header: 'Recorded address',
      render: (row: SettlementItem) => (
        <span className="font-mono text-[10px] break-all text-text-muted max-w-[220px] inline-block">
          {row.usdt_address ?? '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Recorded at',
      render: (row: SettlementItem) => (
        <span className="text-xs text-text-muted">
          {formatDateTime(new Date(row.created_at))}
        </span>
      ),
    },
  ];

  const items = settlementPage?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Wallet className="h-7 w-7 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Balance</h1>
          <p className="text-sm text-text-muted">USDT accumulated from completed pay-outs</p>
        </div>
      </div>

      <Card className="p-6">
        <p className="text-sm text-text-muted">Current balance</p>
        <p className="mt-2 text-3xl font-semibold">
          {isLoading ? '…' : (data?.balance_usdt ?? 0).toFixed(4)} USDT
        </p>
        <p className="mt-4 text-sm text-text-secondary leading-relaxed">
          To request a settlement, contact operations in the shared support Telegram channel with the amount and
          your USDT wallet address. There is no settlement request form in this cabinet. After the transfer is
          sent off-platform, an administrator records the settlement here so your balance is reduced; completed
          debits appear below.
        </p>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Settlement history</h2>
        <p className="text-sm text-text-muted mb-3">
          DEBIT rows release USDT credited to you previously; adjustments may appear as CREDIT.
        </p>
        <DataTable
          columns={settlementCols}
          data={items}
          isLoading={settlementsLoading}
          emptyMessage="No settlements recorded yet"
        />
      </div>
    </div>
  );
}

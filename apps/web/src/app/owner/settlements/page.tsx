'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';

interface Settlement {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: string;
  note: string | null;
  createdAt: string;
  admin: { email: string } | null;
  trader: { user: { email: string } } | null;
}

interface SettlementsResponse {
  data: Settlement[];
  total: number;
  page: number;
  limit: number;
}

interface SettlementDetail extends Settlement {}

const typeColor: Record<string, 'green' | 'red'> = {
  CREDIT: 'green',
  DEBIT: 'red',
};

export default function SettlementsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('ALL');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'settlements', tab, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (tab !== 'ALL') params.set('type', tab);
      return api.get<SettlementsResponse>(`${internalPaths.settlements}?${params}`);
    },
  });

  const { data: details } = useQuery({
    queryKey: ['owner', 'settlement-details', detailId],
    queryFn: () => api.get<SettlementDetail>(internalPaths.settlementDetail(detailId!)),
    enabled: !!detailId,
  });

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / (data.limit || 20)))
    : 1;

  const columns = [
    {
      key: 'id',
      header: 'Settlement ID',
      render: (s: Settlement) => (
        <span className="font-mono text-sm text-text-primary">{s.id.slice(0, 12)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (s: Settlement) => (
        <Badge color={typeColor[s.type] ?? 'default'}>{s.type}</Badge>
      ),
    },
    {
      key: 'trader',
      header: 'Trader',
      render: (s: Settlement) => (
        <span className="text-sm text-text-secondary">
          {s.trader?.user?.email ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (s: Settlement) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {s.amount.toLocaleString()} {s.currency}
        </span>
      ),
    },
    {
      key: 'admin',
      header: 'Created By',
      render: (s: Settlement) => (
        <span className="text-sm text-text-muted">{s.admin?.email ?? '—'}</span>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (s: Settlement) => (
        <span className="text-sm text-text-muted">
          {new Date(s.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s: Settlement) => (
        <IconButton label="View settlement details" onClick={() => setDetailId(s.id)}>
          <Eye className="h-3.5 w-3.5" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settlements</h1>
        <p className="mt-1 text-sm text-text-muted">
          Admin-created balance adjustments (credits and debits) for traders
        </p>
      </div>

      <Tabs
        tabs={[
          { key: 'ALL', label: 'All' },
          { key: 'CREDIT', label: 'Credits' },
          { key: 'DEBIT', label: 'Debits' },
        ]}
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No settlements found"
      />

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Settlement — ${detailId?.slice(0, 12) ?? ''}`}
      >
        {details && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Type</p>
                <Badge color={typeColor[details.type] ?? 'default'}>{details.type}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted">Amount</p>
                <p className="font-mono font-medium text-text-primary">
                  {details.amount.toLocaleString()} {details.currency}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Trader</p>
                <p className="text-sm text-text-primary">{details.trader?.user?.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Created By</p>
                <p className="text-sm text-text-secondary">{details.admin?.email ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-text-muted">Created At</p>
                <p className="text-sm text-text-secondary">
                  {new Date(details.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {details.note && (
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3">
                <p className="mb-1 text-xs text-text-muted">Note</p>
                <p className="text-sm text-text-secondary">{details.note}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

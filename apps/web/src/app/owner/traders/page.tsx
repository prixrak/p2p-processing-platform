'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, ToggleLeft, ToggleRight, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import {
  PayoutLimitsModal,
  TraderDetailModal,
  staffTraderKeys,
  type PayoutLimitsTrader,
} from '@/features/traders';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { IconButton } from '@/components/ui/icon-button';

interface Trader {
  id: string;
  name: string;
  email: string;
  status: string;
  activeRequisitesCount: number;
  totalVolume: number;
  ordersCount: number;
  payoutMinLimit?: number;
  payoutMaxLimit?: number;
}

export default function TradersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [limitsTrader, setLimitsTrader] = useState<PayoutLimitsTrader | null>(null);
  const [detailTraderId, setDetailTraderId] = useState<string | null>(null);
  const [detailTraderName, setDetailTraderName] = useState('');

  const { data: tradersRaw = [], isLoading } = useQuery<Trader[]>({
    queryKey: staffTraderKeys.list('owner'),
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{
          id: string;
          isActive: boolean;
          user: { email: string };
          requisites?: unknown[];
          ordersCount?: number;
          totalVolume?: number;
          payoutMinLimit?: number | string | null;
          payoutMaxLimit?: number | string | null;
        }>;
      }>(`${internalPaths.traders}?page=1&limit=500`);
      return res.data.map((p) => ({
        id: p.id,
        name: p.user.email.split('@')[0] ?? 'Trader',
        email: p.user.email,
        status: p.isActive ? 'active' : 'inactive',
        activeRequisitesCount: Array.isArray(p.requisites) ? p.requisites.length : 0,
        totalVolume: p.totalVolume ?? 0,
        ordersCount: p.ordersCount ?? 0,
        payoutMinLimit: p.payoutMinLimit ? Number(p.payoutMinLimit) : 0,
        payoutMaxLimit: p.payoutMaxLimit ? Number(p.payoutMaxLimit) : 0,
      }));
    },
  });

  const traders = useMemo(() => {
    let list = tradersRaw;
    if (statusFilter === 'active') list = list.filter((t) => t.status === 'active');
    if (statusFilter === 'inactive') list = list.filter((t) => t.status === 'inactive');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.email.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tradersRaw, statusFilter, search]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? api.patch(internalPaths.traderActivate(id))
        : api.patch(internalPaths.traderDeactivate(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'traders'] });
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Trader) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    { key: 'email', header: 'Email' },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (row: Trader) => <StatusBadge status={row.status} />,
    },
    {
      key: 'activeRequisitesCount',
      header: 'Requisites',
      className: 'text-end tabular-nums',
      render: (row: Trader) => <span>{row.activeRequisitesCount}</span>,
    },
    {
      key: 'totalVolume',
      header: 'Volume',
      className: 'text-end tabular-nums',
      render: (row: Trader) => (
        <span className="font-mono">${row.totalVolume.toLocaleString()}</span>
      ),
    },
    {
      key: 'ordersCount',
      header: 'Orders',
      className: 'text-end tabular-nums',
      render: (row: Trader) => <span>{row.ordersCount}</span>,
    },
    {
      key: 'payoutLimits',
      header: 'Payout Limits',
      className: 'text-end tabular-nums font-mono',
      render: (row: Trader) => (
        <span className="text-xs text-text-muted font-mono">
          {row.payoutMinLimit === 0 && row.payoutMaxLimit === 0
            ? 'No limit'
            : `${row.payoutMinLimit ?? 0} – ${row.payoutMaxLimit ?? 0}`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      render: (row: Trader) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Set payout pool limits"
            variant="ghost"
            onClick={() => {
              setLimitsTrader({
                id: row.id,
                name: row.name,
                payoutMinLimit: row.payoutMinLimit ?? 0,
                payoutMaxLimit: row.payoutMaxLimit ?? 0,
              });
            }}
            className="!min-h-8 !min-w-8 !p-1"
          >
            <SlidersHorizontal size={16} />
          </IconButton>
          <IconButton
            label={row.status === 'active' ? 'Disable trader' : 'Enable trader'}
            variant="ghost"
            onClick={() => toggleMutation.mutate({ id: row.id, enabled: row.status !== 'active' })}
            className="!min-h-8 !min-w-8 !p-1"
          >
            {row.status === 'active' ? (
              <ToggleRight size={20} className="text-accent-green" />
            ) : (
              <ToggleLeft size={20} />
            )}
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Users size={24} />
            Traders
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage platform traders and their activity
          </p>
        </div>
      </div>

      <FilterBar>
        <FilterInput
          label="Search"
          value={search}
          onChange={setSearch}
          placeholder="Name or email..."
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={traders}
        keyExtractor={(t) => t.id}
        isLoading={isLoading}
        emptyMessage="No traders found"
        onRowClick={(row) => {
          setDetailTraderId(row.id);
          setDetailTraderName(row.name);
        }}
      />

      <PayoutLimitsModal
        trader={limitsTrader}
        onClose={() => setLimitsTrader(null)}
        queryPrefix="owner"
      />

      <TraderDetailModal
        open={!!detailTraderId}
        onClose={() => setDetailTraderId(null)}
        traderId={detailTraderId}
        traderName={detailTraderName}
        queryPrefix="owner"
      />
    </div>
  );
}

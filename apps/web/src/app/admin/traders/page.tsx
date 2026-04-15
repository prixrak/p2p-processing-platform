'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { Modal } from '@/components/ui/modal';

interface Trader {
  id: string;
  name: string;
  email: string;
  status: string;
  activeRequisitesCount: number;
  totalVolume: number;
  ordersCount: number;
}

interface TraderDetail {
  id: string;
  name: string;
  email: string;
  status: string;
  requisites: Requisite[];
  orders: TraderOrder[];
  balances: Balance[];
}

interface Requisite {
  id: string;
  bank: string;
  method: string;
  currency: string;
  status: string;
}

interface TraderOrder {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface Balance {
  currency: string;
  available: number;
  frozen: number;
}

export default function TradersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTrader, setSelectedTrader] = useState<TraderDetail | null>(null);

  const { data: traders = [], isLoading } = useQuery<Trader[]>({
    queryKey: ['admin', 'traders', { status: statusFilter, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await api.get<{
        data: Array<{
          id: string;
          isActive: boolean;
          user: { email: string };
          requisites?: unknown[];
        }>;
      }>(`${internalPaths.traders}?${params}`);
      return res.data.map((p) => ({
        id: p.id,
        name: p.user.email.split('@')[0] ?? 'Trader',
        email: p.user.email,
        status: p.isActive ? 'active' : 'inactive',
        activeRequisitesCount: Array.isArray(p.requisites) ? p.requisites.length : 0,
        totalVolume: 0,
        ordersCount: 0,
      }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? api.patch(internalPaths.traderActivate(id))
        : api.patch(internalPaths.traderDeactivate(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'traders'] });
    },
  });

  const { data: traderDetail, isLoading: detailLoading } = useQuery<TraderDetail>({
    queryKey: ['admin', 'traders', selectedTrader?.id],
    queryFn: () => api.get(internalPaths.trader(selectedTrader!.id)),
    enabled: !!selectedTrader,
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    { key: 'email', header: 'Email' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'activeRequisitesCount',
      header: 'Requisites',
      render: (row) => <span>{row.activeRequisitesCount}</span>,
    },
    {
      key: 'totalVolume',
      header: 'Volume',
      render: (row) => (
        <span className="font-mono">${row.totalVolume.toLocaleString()}</span>
      ),
    },
    {
      key: 'ordersCount',
      header: 'Orders',
      render: (row) => <span>{row.ordersCount}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMutation.mutate({
              id: row.id,
              enabled: row.status !== 'active',
            });
          }}
          className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
          title={row.status === 'active' ? 'Disable trader' : 'Enable trader'}
        >
          {row.status === 'active' ? (
            <ToggleRight size={20} className="text-accent-green" />
          ) : (
            <ToggleLeft size={20} />
          )}
        </button>
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
            { value: 'disabled', label: 'Disabled' },
            { value: 'pending', label: 'Pending' },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={traders}
        keyExtractor={(t) => t.id}
        isLoading={isLoading}
        emptyMessage="No traders found"
        onRowClick={(row) =>
          setSelectedTrader({ id: row.id, name: row.name, email: row.email, status: row.status, requisites: [], orders: [], balances: [] })
        }
      />

      <Modal
        open={!!selectedTrader}
        onClose={() => setSelectedTrader(null)}
        title={`Trader: ${selectedTrader?.name ?? ''}`}
        className="max-w-2xl"
      >
        {detailLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : traderDetail ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted">Email</p>
                <p className="text-text-primary">{traderDetail.email}</p>
              </div>
              <div>
                <p className="text-text-muted">Status</p>
                <StatusBadge status={traderDetail.status} />
              </div>
            </div>

            {traderDetail.balances.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Balances</h4>
                <div className="grid grid-cols-3 gap-3">
                  {traderDetail.balances.map((b) => (
                    <div
                      key={b.currency}
                      className="bg-bg-tertiary rounded-lg p-3 text-sm"
                    >
                      <p className="text-text-muted">{b.currency}</p>
                      <p className="text-text-primary font-mono">
                        {b.available.toLocaleString()}
                      </p>
                      {b.frozen > 0 && (
                        <p className="text-xs text-accent-yellow">
                          Frozen: {b.frozen.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {traderDetail.requisites.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  Requisites ({traderDetail.requisites.length})
                </h4>
                <div className="space-y-2">
                  {traderDetail.requisites.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between bg-bg-tertiary rounded-lg p-3 text-sm"
                    >
                      <div>
                        <span className="text-text-primary">{r.bank}</span>
                        <span className="text-text-muted ml-2">{r.method}</span>
                        <span className="text-text-muted ml-2">{r.currency}</span>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {traderDetail.orders.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  Recent Orders
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {traderDetail.orders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between bg-bg-tertiary rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-text-muted text-xs font-mono">
                          {o.id.slice(0, 8)}
                        </span>
                        <span className="text-text-primary">
                          {o.amount.toLocaleString()} {o.currency}
                        </span>
                        <span className="text-text-muted uppercase text-xs">
                          {o.type}
                        </span>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

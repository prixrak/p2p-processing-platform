'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface Trader {
  id: string;
  name: string;
  email: string;
  status: string;
  balance: number;
  currency: string;
  completedOrders: number;
  successRate: number;
  avgResponseTime: number;
  createdAt: string;
}

interface TradersResponse {
  data: Trader[];
  total: number;
  page: number;
  totalPages: number;
}

interface TraderDetails {
  id: string;
  name: string;
  email: string;
  status: string;
  balance: number;
  currency: string;
  completedOrders: number;
  successRate: number;
  avgResponseTime: number;
  requisites: { id: string; bank: string; cardNumber: string; status: string }[];
  recentOrders: { id: string; type: string; amount: number; status: string; createdAt: string }[];
}

export default function TradersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detailTrader, setDetailTrader] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'traders', page, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const raw = await api.get<{
        data: Array<{
          id: string;
          isActive: boolean;
          user: { email: string };
          balances: Array<{ amount: unknown; currency: string }>;
          createdAt: string;
          completedOrders?: number;
          successRate?: number;
        }>;
        total: number;
        page: number;
        limit: number;
      }>(`${internalPaths.traders}?${params}`);
      const limit = raw.limit || 20;
      return {
        data: raw.data.map((p) => {
          const email = p.user.email;
          const primary =
            p.balances.find((b) => Number(b.amount) !== 0) ?? p.balances[0];
          return {
            id: p.id,
            name: email.split('@')[0] ?? email,
            email,
            status: p.isActive ? 'active' : 'inactive',
            balance: primary ? Number(primary.amount) : 0,
            currency: primary?.currency ?? '—',
            completedOrders: p.completedOrders ?? 0,
            successRate: p.successRate ?? 0,
            avgResponseTime: 0,
            createdAt: p.createdAt,
          };
        }),
        total: raw.total,
        page: raw.page,
        totalPages: Math.max(1, Math.ceil(raw.total / limit)),
      } satisfies TradersResponse;
    },
  });

  const { data: details } = useQuery({
    queryKey: ['owner', 'trader-details', detailTrader],
    queryFn: () =>
      api.get<TraderDetails>(internalPaths.trader(detailTrader!)),
    enabled: !!detailTrader,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      status === 'active'
        ? api.patch(internalPaths.traderDeactivate(id))
        : api.patch(internalPaths.traderActivate(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'traders'] }),
  });

  const columns = [
    {
      key: 'name',
      header: 'Trader',
      render: (t: Trader) => (
        <div>
          <p className="font-medium text-text-primary">{t.name}</p>
          <p className="text-xs text-text-muted">{t.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t: Trader) => (
        <Badge color={t.status === 'active' ? 'green' : 'red'}>{t.status}</Badge>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (t: Trader) => (
        <span className="font-mono text-sm text-text-primary">
          {t.balance.toLocaleString()} {t.currency}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      render: (t: Trader) => (
        <span className="text-sm text-text-secondary">{t.completedOrders.toLocaleString()}</span>
      ),
    },
    {
      key: 'rate',
      header: 'Success Rate',
      render: (t: Trader) => (
        <span className={`text-sm font-medium ${t.successRate >= 95 ? 'text-success' : t.successRate >= 80 ? 'text-warning' : 'text-danger'}`}>
          {t.successRate}%
        </span>
      ),
    },
    {
      key: 'response',
      header: 'Avg Response',
      render: (t: Trader) => (
        <span className="text-sm text-text-secondary">{t.avgResponseTime}s</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t: Trader) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDetailTrader(t.id)} title="View">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={t.status === 'active' ? 'danger' : 'success'}
            size="sm"
            onClick={() => toggleStatus.mutate({ id: t.id, status: t.status })}
          >
            {t.status === 'active' ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Traders</h1>
        <p className="mt-1 text-sm text-text-muted">Manage traders, view performance and requisites</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search traders..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No traders found"
      />

      <Modal
        open={!!detailTrader}
        onClose={() => setDetailTrader(null)}
        title={`Trader — ${details?.name ?? ''}`}
        className="max-w-2xl"
      >
        {details && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3 text-center">
                <p className="text-lg font-bold text-text-primary">{details.completedOrders}</p>
                <p className="text-xs text-text-muted">Orders</p>
              </div>
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3 text-center">
                <p className="text-lg font-bold text-success">{details.successRate}%</p>
                <p className="text-xs text-text-muted">Success Rate</p>
              </div>
              <div className="rounded-lg border border-border-primary bg-surface-primary p-3 text-center">
                <p className="text-lg font-bold text-text-primary">{details.avgResponseTime}s</p>
                <p className="text-xs text-text-muted">Avg Response</p>
              </div>
            </div>

            {details.requisites?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Requisites</h4>
                <div className="space-y-2">
                  {details.requisites.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">{r.bank}</p>
                        <p className="font-mono text-xs text-text-muted">{r.cardNumber}</p>
                      </div>
                      <Badge color={r.status === 'active' ? 'green' : 'red'}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {details.recentOrders?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-secondary">Recent Orders</h4>
                <div className="space-y-2">
                  {details.recentOrders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-text-primary">
                          {o.type} — {o.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-text-muted">
                          {new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="font-mono text-sm text-text-primary">{o.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

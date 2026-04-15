'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';

interface Merchant {
  id: string;
  name: string;
  status: string;
  balance: number;
  currency: string;
  ordersCount: number;
  createdAt: string;
}

interface MerchantsResponse {
  data: Merchant[];
  total: number;
  page: number;
  totalPages: number;
}

interface MerchantApiRow {
  id: string;
  name: string;
  isLock: boolean;
  createdAt: string;
  balances: Array<{ amount: unknown; currency: string }>;
}

function mapMerchantRow(m: MerchantApiRow): Merchant {
  const primary =
    m.balances.find((b) => Number(b.amount) !== 0) ?? m.balances[0];
  return {
    id: m.id,
    name: m.name,
    status: m.isLock ? 'locked' : 'active',
    balance: primary ? Number(primary.amount) : 0,
    currency: primary?.currency ?? '—',
    ordersCount: 0,
    createdAt: m.createdAt,
  };
}

interface MerchantConfig {
  commissionPayin: number;
  commissionPayout: number;
  directions: string[];
}

export default function MerchantsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [configModal, setConfigModal] = useState<Merchant | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [config, setConfig] = useState<MerchantConfig>({
    commissionPayin: 0,
    commissionPayout: 0,
    directions: [],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'merchants', page],
    queryFn: async () => {
      const raw = await api.get<{
        data: MerchantApiRow[];
        total: number;
        page: number;
        limit: number;
      }>(`${internalPaths.merchants}?page=${page}&limit=20`);
      const limit = raw.limit || 20;
      return {
        data: raw.data.map(mapMerchantRow),
        total: raw.total,
        page: raw.page,
        totalPages: Math.max(1, Math.ceil(raw.total / limit)),
      } satisfies MerchantsResponse;
    },
  });

  const { data: merchantConfig } = useQuery({
    queryKey: ['owner', 'merchant-config', configModal?.id],
    queryFn: () =>
      api.get<MerchantConfig>(
        internalPaths.notImplemented.merchantConfig(configModal!.id),
      ),
    enabled: !!configModal,
  });

  const createMerchant = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post(internalPaths.merchants, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'merchants'] });
      setShowCreate(false);
      setForm({ name: '', email: '', password: '' });
    },
  });

  const toggleLock = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      status === 'active'
        ? api.patch(internalPaths.merchantLock(id))
        : api.patch(internalPaths.merchantUnlock(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'merchants'] }),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      api.patch(
        internalPaths.notImplemented.merchantConfig(configModal!.id),
        config,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'merchants'] });
      setConfigModal(null);
    },
  });

  const openConfig = (m: Merchant) => {
    setConfigModal(m);
    if (merchantConfig) {
      setConfig(merchantConfig);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Merchant',
      render: (m: Merchant) => (
        <div>
          <p className="font-medium text-text-primary">{m.name}</p>
          <p className="text-xs text-text-muted">ID: {m.id.slice(0, 8)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m: Merchant) => (
        <Badge color={m.status === 'active' ? 'green' : 'red'}>
          {m.status}
        </Badge>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (m: Merchant) => (
        <span className="font-mono text-sm text-text-primary">
          {(m.balance ?? 0).toLocaleString()} {m.currency ?? '—'}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      render: (m: Merchant) => (
        <span className="text-sm text-text-secondary">
          {(m.ordersCount ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (m: Merchant) => (
        <span className="text-sm text-text-secondary">
          {new Date(m.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (m: Merchant) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openConfig(m)} title="Configure">
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={m.status === 'active' ? 'danger' : 'success'}
            size="sm"
            onClick={() => toggleLock.mutate({ id: m.id, status: m.status })}
            title={m.status === 'active' ? 'Lock' : 'Unlock'}
          >
            {m.status === 'active' ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Unlock className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Merchants</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage merchant accounts, commissions and directions
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Connect Merchant
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No merchants found"
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Connect New Merchant">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMerchant.mutate(form);
          }}
        >
          <Input
            label="Merchant Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Corp"
            required
          />
          <Input
            label="Contact Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="merchant@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMerchant.isPending}>
              Connect
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!configModal}
        onClose={() => setConfigModal(null)}
        title={`Configure — ${configModal?.name ?? ''}`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveConfig.mutate();
          }}
        >
          <Input
            label="Pay-In Commission (%)"
            type="number"
            step="0.01"
            min="0"
            value={config.commissionPayin}
            onChange={(e) =>
              setConfig({ ...config, commissionPayin: parseFloat(e.target.value) || 0 })
            }
          />
          <Input
            label="Pay-Out Commission (%)"
            type="number"
            step="0.01"
            min="0"
            value={config.commissionPayout}
            onChange={(e) =>
              setConfig({ ...config, commissionPayout: parseFloat(e.target.value) || 0 })
            }
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setConfigModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saveConfig.isPending}>
              Save Configuration
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

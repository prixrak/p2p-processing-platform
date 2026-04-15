'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Percent, Trash2 } from 'lucide-react';
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

interface MerchantDirection {
  id: string;
  directionType: 'PAYIN' | 'PAYOUT';
  currency: string;
  minAmount: string;
  maxAmount: string;
  defaultCommissionPercent: string;
  isActive: boolean;
  commissionTiers: Array<{ id: string; amountFrom: string; amountTo: string | null; commissionPercent: string }>;
}

const DIR_LABELS: Record<string, string> = { PAYIN: 'Pay-In', PAYOUT: 'Pay-Out' };

export default function MerchantsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [directionsModal, setDirectionsModal] = useState<Merchant | null>(null);
  const [showAddDir, setShowAddDir] = useState(false);
  const [dirForm, setDirForm] = useState({
    directionType: 'PAYIN',
    currency: 'UAH',
    minAmount: 0,
    maxAmount: 0,
    defaultCommissionPercent: 5,
  });
  const [form, setForm] = useState({ name: '', email: '', password: '' });

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

  const { data: merchantDirections, isLoading: dirsLoading } = useQuery({
    queryKey: ['owner', 'merchant-directions', directionsModal?.id],
    queryFn: () =>
      api.get<MerchantDirection[]>(internalPaths.merchantDirections(directionsModal!.id)),
    enabled: !!directionsModal,
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

  const createDirection = useMutation({
    mutationFn: (body: typeof dirForm) =>
      api.post(internalPaths.merchantDirections(directionsModal!.id), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner', 'merchant-directions', directionsModal?.id] });
      setShowAddDir(false);
      setDirForm({ directionType: 'PAYIN', currency: 'UAH', minAmount: 0, maxAmount: 0, defaultCommissionPercent: 5 });
    },
  });

  const deleteDirection = useMutation({
    mutationFn: ({ dirId }: { dirId: string }) =>
      api.delete(internalPaths.merchantDirection(directionsModal!.id, dirId)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['owner', 'merchant-directions', directionsModal?.id] }),
  });

  const toggleDirection = useMutation({
    mutationFn: ({ dirId, isActive }: { dirId: string; isActive: boolean }) =>
      api.patch(internalPaths.merchantDirection(directionsModal!.id, dirId), { isActive: !isActive }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['owner', 'merchant-directions', directionsModal?.id] }),
  });

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
          <Button variant="ghost" size="sm" onClick={() => setDirectionsModal(m)} title="Комісії та напрямки">
            <Percent className="h-3.5 w-3.5" />
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

      {/* Merchant Directions Modal */}
      <Modal
        open={!!directionsModal}
        onClose={() => { setDirectionsModal(null); setShowAddDir(false); }}
        title={`Напрямки та комісії — ${directionsModal?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-4">
          {dirsLoading && <p className="text-sm text-text-muted">Завантаження…</p>}

          {!dirsLoading && (merchantDirections ?? []).length === 0 && (
            <p className="text-sm text-text-muted py-4 text-center">
              Немає налаштованих напрямків — використовуються глобальні налаштування
            </p>
          )}

          {(merchantDirections ?? []).map((dir) => (
            <div
              key={dir.id}
              className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge color={dir.directionType === 'PAYIN' ? 'blue' : 'yellow'}>
                    {DIR_LABELS[dir.directionType]}
                  </Badge>
                  <span className="font-mono font-semibold text-text-primary">{dir.currency}</span>
                  <Badge color={dir.isActive ? 'green' : 'red'}>
                    {dir.isActive ? 'active' : 'inactive'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDirection.mutate({ dirId: dir.id, isActive: dir.isActive })}
                  >
                    {dir.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteDirection.mutate({ dirId: dir.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Мін/Макс</p>
                  <p className="text-text-primary">
                    {Number(dir.minAmount).toLocaleString()} — {Number(dir.maxAmount).toLocaleString()} {dir.currency}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Комісія (default)</p>
                  <p className="text-text-primary font-mono">{Number(dir.defaultCommissionPercent).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Тарифні тири</p>
                  <p className="text-text-primary">{dir.commissionTiers.length}</p>
                </div>
              </div>
              {dir.commissionTiers.length > 0 && (
                <div className="border-t border-border pt-2">
                  <p className="text-xs text-text-muted mb-1">Тири комісій:</p>
                  <div className="space-y-1">
                    {dir.commissionTiers.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                        <span>{Number(t.amountFrom).toLocaleString()} — {t.amountTo ? Number(t.amountTo).toLocaleString() : '∞'}</span>
                        <span className="text-green-400">{Number(t.commissionPercent).toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!showAddDir ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAddDir(true)}>
              <Plus className="h-4 w-4" /> Додати напрямок
            </Button>
          ) : (
            <form
              className="rounded-lg border border-border border-dashed p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createDirection.mutate(dirForm);
              }}
            >
              <p className="text-sm font-medium text-text-primary">Новий напрямок</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Тип</label>
                  <select
                    className="w-full rounded border border-border bg-bg-primary text-text-primary px-2 py-1.5 text-sm"
                    value={dirForm.directionType}
                    onChange={(e) => setDirForm({ ...dirForm, directionType: e.target.value })}
                  >
                    <option value="PAYIN">Pay-In</option>
                    <option value="PAYOUT">Pay-Out</option>
                  </select>
                </div>
                <Input
                  label="Валюта"
                  value={dirForm.currency}
                  onChange={(e) => setDirForm({ ...dirForm, currency: e.target.value.toUpperCase() })}
                  placeholder="UAH"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Мін сума"
                  type="number"
                  min="0"
                  value={dirForm.minAmount}
                  onChange={(e) => setDirForm({ ...dirForm, minAmount: Number(e.target.value) })}
                />
                <Input
                  label="Макс сума"
                  type="number"
                  min="0"
                  value={dirForm.maxAmount}
                  onChange={(e) => setDirForm({ ...dirForm, maxAmount: Number(e.target.value) })}
                />
                <Input
                  label="Комісія %"
                  type="number"
                  step="0.01"
                  min="0"
                  value={dirForm.defaultCommissionPercent}
                  onChange={(e) => setDirForm({ ...dirForm, defaultCommissionPercent: Number(e.target.value) })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddDir(false)}>Скасувати</Button>
                <Button size="sm" type="submit" loading={createDirection.isPending}>Додати</Button>
              </div>
            </form>
          )}

          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => { setDirectionsModal(null); setShowAddDir(false); }}>Закрити</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

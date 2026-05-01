'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Percent, Trash2 } from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import {
  mergeCreatedIntoPaginatedQueries,
  patchEntitiesInPaginatedQueries,
} from '@/lib/query-cache-merge';

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
  userId: string;
  name: string;
  isLock: boolean;
  createdAt: string;
  balances: Array<{ amount: unknown; currency: string }>;
  ordersCount?: number;
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
    ordersCount: m.ordersCount ?? 0,
    createdAt: m.createdAt,
  };
}

function mapMerchantCreatedToRow(api: MerchantApiRow): Merchant {
  return mapMerchantRow({
    id: api.id,
    userId: api.userId,
    name: api.name,
    isLock: api.isLock ?? false,
    createdAt: api.createdAt,
    balances: api.balances ?? [],
    ordersCount: api.ordersCount ?? 0,
  });
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
  const [form, setForm] = useState({ userId: '', name: '' });

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

  const { data: linkUsers } = useQuery({
    queryKey: ['owner', 'users', 'merchant-link-candidates'],
    queryFn: async () => {
      const raw = await api.get<{
        data: Array<{ id: string; email: string; role: string }>;
      }>(`${internalPaths.users}?page=1&limit=500`);
      return raw.data;
    },
    enabled: showCreate,
  });

  const { data: linkedMerchantUserIds } = useQuery({
    queryKey: ['owner', 'merchants', 'linked-user-ids'],
    queryFn: async () => {
      const raw = await api.get<{
        data: Array<{ userId: string }>;
      }>(`${internalPaths.merchants}?page=1&limit=500`);
      return new Set(raw.data.map((m) => m.userId));
    },
    enabled: showCreate,
  });

  const merchantUserSelectOptions = useMemo(() => {
    if (!linkUsers || !linkedMerchantUserIds) return [];
    return linkUsers
      .filter((u) => u.role === UserRole.MERCHANT && !linkedMerchantUserIds.has(u.id))
      .map((u) => ({ value: u.id, label: u.email }));
  }, [linkUsers, linkedMerchantUserIds]);

  const { data: merchantDirections, isLoading: dirsLoading } = useQuery({
    queryKey: ['owner', 'merchant-directions', directionsModal?.id],
    queryFn: () =>
      api.get<MerchantDirection[]>(internalPaths.merchantDirections(directionsModal!.id)),
    enabled: !!directionsModal,
  });

  const createMerchant = useMutation({
    mutationFn: (payload: { userId: string; name: string }) =>
      api.post<MerchantApiRow>(internalPaths.merchants, {
        userId: payload.userId,
        name: payload.name.trim(),
      }),
    onSuccess: (created, variables) => {
      mergeCreatedIntoPaginatedQueries(queryClient, {
        queryKeyPrefix: ['owner', 'merchants'],
        row: mapMerchantCreatedToRow(created),
        matchesQueryKey: () => true,
        getPageNumber: (key) => (typeof key[2] === 'number' ? (key[2] as number) : undefined),
        defaultLimit: 20,
      });
      queryClient.setQueryData<Set<string> | undefined>(
        ['owner', 'merchants', 'linked-user-ids'],
        (old) => {
          if (!old) return old;
          const next = new Set(old);
          next.add(variables.userId);
          return next;
        },
      );
      setShowCreate(false);
      setForm({ userId: '', name: '' });
    },
  });

  const toggleLock = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      status === 'active'
        ? api.patch(internalPaths.merchantLock(id))
        : api.patch(internalPaths.merchantUnlock(id)),
    onSuccess: (_data, variables) => {
      patchEntitiesInPaginatedQueries(queryClient, {
        queryKeyPrefix: ['owner', 'merchants'],
        whereId: variables.id,
        mapRow: (row) => ({
          ...row,
          status: variables.status === 'active' ? 'locked' : 'active',
        }),
      });
    },
  });

  const createDirection = useMutation({
    mutationFn: (body: typeof dirForm) =>
      api.post<MerchantDirection>(internalPaths.merchantDirections(directionsModal!.id), body),
    onSuccess: (row, _vars) => {
      const mid = directionsModal?.id;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(['owner', 'merchant-directions', mid], (old) => {
        if (!old) return [row];
        const next = [...old.filter((d) => d.id !== row.id), row];
        next.sort((a, b) => a.directionType.localeCompare(b.directionType) || a.currency.localeCompare(b.currency));
        return next;
      });
      setShowAddDir(false);
      setDirForm({ directionType: 'PAYIN', currency: 'UAH', minAmount: 0, maxAmount: 0, defaultCommissionPercent: 5 });
    },
  });

  const deleteDirection = useMutation({
    mutationFn: ({ dirId }: { dirId: string }) =>
      api.delete(internalPaths.merchantDirection(directionsModal!.id, dirId)),
    onSuccess: (_data, variables) => {
      const mid = directionsModal?.id;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(
        ['owner', 'merchant-directions', mid],
        (old) => old?.filter((d) => d.id !== variables.dirId) ?? [],
      );
    },
  });

  const toggleDirection = useMutation({
    mutationFn: ({ dirId, isActive }: { dirId: string; isActive: boolean }) =>
      api.patch<MerchantDirection>(internalPaths.merchantDirection(directionsModal!.id, dirId), {
        isActive: !isActive,
      }),
    onSuccess: (updated, variables) => {
      const mid = directionsModal?.id;
      if (!mid) return;
      queryClient.setQueryData<MerchantDirection[]>(
        ['owner', 'merchant-directions', mid],
        (old) => old?.map((d) => (d.id === variables.dirId ? updated : d)) ?? [],
      );
    },
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
      className: 'text-center',
      render: (m: Merchant) => (
        <Badge color={m.status === 'active' ? 'green' : 'red'}>
          {m.status}
        </Badge>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      className: 'text-end tabular-nums',
      render: (m: Merchant) => (
        <span className="font-mono text-sm text-text-primary">
          {(m.balance ?? 0).toLocaleString()} {m.currency ?? '—'}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      className: 'text-end tabular-nums',
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
      className: 'text-end',
      render: (m: Merchant) => (
        <div className="flex items-center gap-2">
          <IconButton
            label="Directions & commissions (rates, tiers)"
            onClick={() => setDirectionsModal(m)}
          >
            <Percent className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={m.status === 'active' ? 'Lock merchant account' : 'Unlock merchant account'}
            variant={m.status === 'active' ? 'danger' : 'success'}
            onClick={() => toggleLock.mutate({ id: m.id, status: m.status })}
          >
            {m.status === 'active' ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Unlock className="h-3.5 w-3.5" />
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
          <h1 className="text-2xl font-bold text-text-primary">Merchants</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage merchant accounts, commissions and directions
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Link merchant profile
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Link merchant profile">
        <p className="text-sm text-text-muted">
          Create a user with role Merchant on the Users page first, then pick that account and set the
          display name for the payment profile.
        </p>
        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMerchant.mutate(form);
          }}
        >
          <Select
            label="User (role: merchant)"
            placeholder="Select user…"
            options={merchantUserSelectOptions}
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            required
          />
          {showCreate && merchantUserSelectOptions.length === 0 && linkUsers && linkedMerchantUserIds && (
            <p className="text-xs text-amber-500">
              No eligible users: add a user with role Merchant that does not already have a merchant profile.
            </p>
          )}
          <Input
            label="Merchant display name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Corp"
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMerchant.isPending} disabled={!form.userId}>
              Link profile
            </Button>
          </div>
        </form>
      </Modal>

      {/* Merchant Directions Modal */}
      <Modal
        open={!!directionsModal}
        onClose={() => { setDirectionsModal(null); setShowAddDir(false); }}
        title={`Directions & commissions — ${directionsModal?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-4">
          {dirsLoading && <p className="text-sm text-text-muted">Loading…</p>}

          {!dirsLoading && (merchantDirections ?? []).length === 0 && (
            <p className="text-sm text-text-muted py-4 text-center">
              No directions configured — global defaults apply
            </p>
          )}

          {(merchantDirections ?? []).map((dir) => (
            <div
              key={dir.id}
              className="rounded-lg border border-border-primary bg-bg-secondary p-4 space-y-3"
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
                  <IconButton
                    label={dir.isActive ? 'Deactivate direction' : 'Activate direction'}
                    variant="ghost"
                    onClick={() => toggleDirection.mutate({ dirId: dir.id, isActive: dir.isActive })}
                  >
                    {dir.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </IconButton>
                  <IconButton
                    label="Delete direction"
                    variant="danger"
                    onClick={() => deleteDirection.mutate({ dirId: dir.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Min/Max</p>
                  <p className="text-text-primary">
                    {Number(dir.minAmount).toLocaleString()} — {Number(dir.maxAmount).toLocaleString()} {dir.currency}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Commission (default)</p>
                  <p className="text-text-primary font-mono">{Number(dir.defaultCommissionPercent).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Pricing tiers</p>
                  <p className="text-text-primary">{dir.commissionTiers.length}</p>
                </div>
              </div>
              {dir.commissionTiers.length > 0 && (
                <div className="border-t border-border-primary pt-2">
                  <p className="text-xs text-text-muted mb-1">Commission tiers:</p>
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
              <Plus className="h-4 w-4" /> Add direction
            </Button>
          ) : (
            <form
              className="rounded-lg border border-border-primary border-dashed p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createDirection.mutate(dirForm);
              }}
            >
              <p className="text-sm font-medium text-text-primary">New direction</p>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Type"
                  options={[
                    { value: 'PAYIN', label: 'Pay-In' },
                    { value: 'PAYOUT', label: 'Pay-Out' },
                  ]}
                  value={dirForm.directionType}
                  onChange={(e) =>
                    setDirForm({ ...dirForm, directionType: e.target.value as 'PAYIN' | 'PAYOUT' })
                  }
                />
                <Input
                  label="Currency"
                  value={dirForm.currency}
                  onChange={(e) => setDirForm({ ...dirForm, currency: e.target.value.toUpperCase() })}
                  placeholder="UAH"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NumberInput
                  label="Min amount"
                  variant="amount"
                  min={0}
                  value={dirForm.minAmount}
                  onChange={(e) => setDirForm({ ...dirForm, minAmount: Number(e.target.value) })}
                />
                <NumberInput
                  label="Max amount"
                  variant="amount"
                  min={0}
                  value={dirForm.maxAmount}
                  onChange={(e) => setDirForm({ ...dirForm, maxAmount: Number(e.target.value) })}
                />
                <NumberInput
                  label="Commission"
                  variant="percent"
                  suffix="%"
                  min={0}
                  value={dirForm.defaultCommissionPercent}
                  onChange={(e) =>
                    setDirForm({ ...dirForm, defaultCommissionPercent: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddDir(false)}>Cancel</Button>
                <Button size="sm" type="submit" loading={createDirection.isPending}>Add</Button>
              </div>
            </form>
          )}

          <div className="flex justify-end border-t border-border-primary pt-2">
            <Button variant="ghost" onClick={() => { setDirectionsModal(null); setShowAddDir(false); }}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

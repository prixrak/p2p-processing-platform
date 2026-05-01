'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import {
  mergeCreatedIntoPaginatedQueries,
  replaceEntityInPaginatedQueries,
} from '@/lib/query-cache-merge';
import { ownerCreateUserFormSchema } from '@/lib/validation/schemas';
import { fieldErrorsFromZod } from '@/lib/validation/zod-field-errors';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { errorMessageFromUnknown } from '@/lib/error-message';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  createdAt: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  totalPages: number;
}

interface UsersApiRow {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const roleColors: Record<UserRole, 'blue' | 'green' | 'yellow' | 'red' | 'default'> = {
  [UserRole.OWNER]: 'red',
  [UserRole.ADMIN]: 'yellow',
  [UserRole.TRADER]: 'green',
  [UserRole.PAYOUT_TRADER]: 'green',
  [UserRole.MERCHANT]: 'blue',
  [UserRole.SUPPORT]: 'default',
  [UserRole.REFERRAL]: 'default',
};

/** Matches API `CREATABLE_USER_ROLES` / `UPDATABLE_ROLES` (no OWNER / REFERRAL). */
const roleOptions = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.TRADER, label: 'Trader' },
  { value: UserRole.PAYOUT_TRADER, label: 'Pay-Out specialist' },
  { value: UserRole.MERCHANT, label: 'Merchant' },
  { value: UserRole.SUPPORT, label: 'Support' },
];

const roleLabel: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.TRADER]: 'Trader',
  [UserRole.PAYOUT_TRADER]: 'Payout trader',
  [UserRole.MERCHANT]: 'Merchant',
  [UserRole.SUPPORT]: 'Support',
  [UserRole.REFERRAL]: 'Referral',
};

function canUpdateRole(role: UserRole): boolean {
  return roleOptions.some((o) => o.value === role);
}

function mapUserApiRow(row: UsersApiRow): User {
  return {
    id: row.id,
    email: row.email,
    name: '',
    role: row.role,
    status: row.isActive ? 'active' : 'inactive',
    createdAt: row.createdAt,
  };
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: UserRole.TRADER,
    countryId: '',
    payoutRate: 0.01,
  });
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    id: string;
    email: string;
    from: UserRole;
    to: UserRole;
  } | null>(null);
  const [pendingStatusToggle, setPendingStatusToggle] = useState<{
    id: string;
    email: string;
    nextActive: boolean;
  } | null>(null);

  const { data: countries } = useQuery({
    queryKey: ['countries', 'active'],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; code: string; currency: string }>>(
        internalPaths.countriesQuery('activeOnly=true'),
      ),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['owner', 'users', page],
    queryFn: async () => {
      const raw = await api.get<{
        data: UsersApiRow[];
        total: number;
        page: number;
        limit: number;
      }>(`${internalPaths.users}?page=${page}&limit=20`);

      const limit = raw.limit || 20;
      return {
        data: raw.data.map((u) => ({
          id: u.id,
          email: u.email,
          name: '',
          role: u.role,
          status: u.isActive ? 'active' : 'inactive',
          createdAt: u.createdAt,
        })),
        total: raw.total,
        page: raw.page,
        totalPages: Math.max(1, Math.ceil(raw.total / limit)),
      } satisfies UsersResponse;
    },
  });

  const createUser = useMutation({
    mutationFn: (payload: typeof form) => {
      const body: Record<string, unknown> = {
        email: payload.email,
        password: payload.password,
        role: payload.role,
      };
      if (payload.role === UserRole.PAYOUT_TRADER) {
        body.countryId = payload.countryId;
        body.payoutRate = payload.payoutRate;
      }
      return api.post<UsersApiRow>(internalPaths.users, body);
    },
    onSuccess: (created) => {
      mergeCreatedIntoPaginatedQueries(queryClient, {
        queryKeyPrefix: ['owner', 'users'],
        row: mapUserApiRow(created),
        matchesQueryKey: () => true,
        getPageNumber: (key) => (typeof key[2] === 'number' ? (key[2] as number) : undefined),
        defaultLimit: 20,
      });
      setShowCreate(false);
      setConfirmCreateOpen(false);
      setCreateFieldErrors({});
      createUser.reset();
      setForm({ email: '', password: '', role: UserRole.TRADER, countryId: '', payoutRate: 0.01 });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<UsersApiRow>(internalPaths.user(id), { isActive }),
    onSuccess: (updated) => {
      replaceEntityInPaginatedQueries(queryClient, {
        queryKeyPrefix: ['owner', 'users'],
        next: mapUserApiRow(updated),
      });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch<UsersApiRow>(internalPaths.user(id), { role }),
    onSuccess: (updated) => {
      replaceEntityInPaginatedQueries(queryClient, {
        queryKeyPrefix: ['owner', 'users'],
        next: mapUserApiRow(updated),
      });
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u: User) => (
        <div>
          <p className="font-medium text-text-primary">{u.name || '—'}</p>
          <p className="text-xs text-text-muted">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      className: 'text-center',
      render: (u: User) => (
        <Badge color={roleColors[u.role] ?? 'default'}>
          {roleLabel[u.role]}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (u: User) => (
        <Badge color={u.status === 'active' ? 'green' : 'red'}>
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (u: User) => (
        <span className="text-sm text-text-secondary">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (u: User) => (
        <div className="flex items-center gap-2">
          {!canUpdateRole(u.role) ? (
            <Badge color={roleColors[u.role] ?? 'default'} className="min-w-[5rem] justify-center">
              {roleLabel[u.role]}
            </Badge>
          ) : (
            <Select
              options={roleOptions}
              value={pendingRoleChange?.id === u.id ? pendingRoleChange.from : u.role}
              onChange={(e) => {
                const nextRole = e.target.value as UserRole;
                if (nextRole === u.role) return;
                setPendingRoleChange({
                  id: u.id,
                  email: u.email,
                  from: u.role,
                  to: nextRole,
                });
              }}
              className="!py-1.5 !text-xs w-28"
            />
          )}
          <IconButton
            label={u.status === 'active' ? 'Deactivate user' : 'Activate user'}
            variant={u.status === 'active' ? 'danger' : 'success'}
            onClick={() =>
              setPendingStatusToggle({
                id: u.id,
                email: u.email,
                nextActive: u.status !== 'active',
              })
            }
          >
            {u.status === 'active' ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <ConfirmDialog
        open={confirmCreateOpen}
        onOpenChange={(next) => {
          setConfirmCreateOpen(next);
          if (!next) createUser.reset();
        }}
        tone="danger"
        title="Create this user?"
        description={
          <>
            <span className="font-medium text-text-primary">{form.email.trim()}</span>
            {' · '}
            <span>{roleLabel[form.role]}</span>
            {form.role === UserRole.PAYOUT_TRADER ? (
              <span className="block mt-2 text-text-muted">
                Pay-Out specialist with payout rate {form.payoutRate}. Access cannot be inferred from
                this dialog alone — double-check role and geo before confirming.
              </span>
            ) : null}
          </>
        }
        confirmLabel="Yes, create user"
        cancelLabel="Back"
        loading={createUser.isPending}
        onConfirm={() => createUser.mutate(form)}
      />

      <ConfirmDialog
        open={!!pendingRoleChange}
        onOpenChange={(next) => !next && setPendingRoleChange(null)}
        tone="danger"
        title="Change user role?"
        description={
          pendingRoleChange ? (
            <>
              Update <span className="font-medium text-text-primary">{pendingRoleChange.email}</span>{' '}
              from <strong>{roleLabel[pendingRoleChange.from]}</strong> to{' '}
              <strong>{roleLabel[pendingRoleChange.to]}</strong>? Role changes affect cabinet access
              immediately.
            </>
          ) : null
        }
        confirmLabel="Change role"
        loading={updateRole.isPending}
        onConfirm={() => {
          if (!pendingRoleChange) return;
          const payload = { id: pendingRoleChange.id, role: pendingRoleChange.to };
          updateRole.mutate(payload, {
            onSettled: () => setPendingRoleChange(null),
          });
        }}
      />

      <ConfirmDialog
        open={!!pendingStatusToggle}
        onOpenChange={(next) => !next && setPendingStatusToggle(null)}
        tone={pendingStatusToggle?.nextActive ? 'default' : 'danger'}
        title={
          pendingStatusToggle?.nextActive ? 'Activate this user?' : 'Deactivate this user?'
        }
        description={
          pendingStatusToggle ? (
            <>
              {pendingStatusToggle.nextActive
                ? 'They will be able to sign in again if credentials are valid.'
                : 'They will be blocked from signing in until reactivated.'}{' '}
              <span className="font-medium text-text-primary">{pendingStatusToggle.email}</span>
            </>
          ) : null
        }
        confirmLabel={pendingStatusToggle?.nextActive ? 'Activate' : 'Deactivate'}
        loading={toggleStatus.isPending}
        onConfirm={() => {
          if (!pendingStatusToggle) return;
          toggleStatus.mutate(
            { id: pendingStatusToggle.id, isActive: pendingStatusToggle.nextActive },
            { onSettled: () => setPendingStatusToggle(null) },
          );
        }}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Users</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage platform users and their roles
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create User
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={data?.totalPages}
        onPageChange={setPage}
        emptyMessage="No users found"
      />

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateFieldErrors({});
          createUser.reset();
        }}
        title="Create User"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setCreateFieldErrors({});
            createUser.reset();
            const parsed = ownerCreateUserFormSchema.safeParse(form);
            if (!parsed.success) {
              setCreateFieldErrors(fieldErrorsFromZod(parsed.error));
              return;
            }
            setConfirmCreateOpen(true);
          }}
        >
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="user@example.com"
            error={createFieldErrors.email}
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            error={createFieldErrors.password}
          />
          <Select
            label="Role"
            options={roleOptions}
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as UserRole })
            }
            error={createFieldErrors.role}
          />
          {form.role === UserRole.PAYOUT_TRADER && (
            <>
              <Select
                label="Geo / country"
                options={
                  countries?.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.currency})`,
                  })) ?? []
                }
                value={form.countryId}
                onChange={(e) => setForm({ ...form, countryId: e.target.value })}
                placeholder="Select country"
                error={createFieldErrors.countryId}
              />
              <Input
                label="Payout rate (fraction, e.g. 0.01 = 1%)"
                type="number"
                step="0.0001"
                min={0}
                value={String(form.payoutRate)}
                onChange={(e) =>
                  setForm({ ...form, payoutRate: parseFloat(e.target.value) || 0 })
                }
                error={createFieldErrors.payoutRate}
              />
            </>
          )}
          {createUser.isError ? (
            <FormAlert>{errorMessageFromUnknown(createUser.error)}</FormAlert>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateFieldErrors({});
                createUser.reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

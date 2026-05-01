'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Users,
  ShieldCheck,
  ShieldOff,
  Percent,
  Lock,
  Unlock,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { errorMessageFromUnknown } from '@/lib/error-message';
import { fetchCurrencyList } from '@/lib/currency-queries';
import { ownerCreateUserFormSchema } from '@/lib/validation/schemas';
import { fieldErrorsFromZod } from '@/lib/validation/zod-field-errors';
import type { StaffRolePrefix } from '@/features/traders';
import { staffTraderKeys } from '@/features/traders';
import { PayoutLimitsModal, type PayoutLimitsTrader } from '@/features/traders';
import { TraderDetailModal } from '@/features/traders';
import { MerchantDirectionsModal } from './merchant-directions-modal';

export interface DirectoryUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  merchant: { id: string; name: string; isLock: boolean } | null;
  traderProfile: {
    id: string;
    isActive: boolean;
    payoutMinLimit: number;
    payoutMaxLimit: number;
  } | null;
  payoutTraderProfile: { id: string } | null;
}

interface UsersDirectoryResponse {
  data: DirectoryUser[];
  total: number;
  page: number;
  limit: number;
  stats: {
    activeCount: number;
    inactiveCount: number;
    byRole: Record<string, number>;
  };
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

const roleOptions = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.TRADER, label: 'Trader' },
  { value: UserRole.PAYOUT_TRADER, label: 'Pay-Out specialist' },
  { value: UserRole.MERCHANT, label: 'Merchant' },
  { value: UserRole.SUPPORT, label: 'Support' },
  { value: UserRole.REFERRAL, label: 'Referral' },
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

/** Roles never shown in the directory UI for this cabinet (aligned with API visibility). */
function directoryExcludedRolesForUi(prefix: StaffRolePrefix): Set<UserRole> {
  const excluded: UserRole[] =
    prefix === 'owner' ? [UserRole.OWNER] : [UserRole.OWNER, UserRole.ADMIN];
  return new Set(excluded);
}

function canUpdateRole(role: UserRole): boolean {
  return roleOptions.some((o) => o.value === role);
}

function usersDirectoryUrl(
  page: number,
  limit: number,
  search: string,
  roleFilter: string,
  statusFilter: string,
) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const t = search.trim();
  if (t) params.set('search', t);
  if (roleFilter) params.set('role', roleFilter);
  if (statusFilter === 'active') params.set('isActive', 'true');
  if (statusFilter === 'inactive') params.set('isActive', 'false');
  return `${internalPaths.users}?${params.toString()}`;
}

export interface StaffUserAccountsPanelProps {
  queryKeyPrefix: StaffRolePrefix;
}

export function StaffUserAccountsPanel({ queryKeyPrefix }: StaffUserAccountsPanelProps) {
  const queryClient = useQueryClient();
  const directoryKey = [queryKeyPrefix, 'users', 'directory'] as const;

  const excludedDirectoryRoles = useMemo(
    () => directoryExcludedRolesForUi(queryKeyPrefix),
    [queryKeyPrefix],
  );

  const assignableStaffRoles = useMemo(() => {
    if (queryKeyPrefix === 'owner') return roleOptions;
    return roleOptions.filter((o) => o.value !== UserRole.ADMIN);
  }, [queryKeyPrefix]);

  const roleFilterOptions = useMemo(
    () => [
      { value: '', label: 'All roles' },
      ...Object.values(UserRole)
        .filter((r) => !excludedDirectoryRoles.has(r))
        .map((r) => ({ value: r, label: roleLabel[r] })),
    ],
    [excludedDirectoryRoles],
  );

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setRoleFilter('');
    setSearchInput('');
    setDebouncedSearch('');
  }, [queryKeyPrefix]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: [...directoryKey, page, debouncedSearch, roleFilter, statusFilter],
    queryFn: () =>
      api.get<UsersDirectoryResponse>(
        usersDirectoryUrl(page, 20, debouncedSearch, roleFilter, statusFilter),
      ),
 });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: UserRole.TRADER,
    countryId: '',
    payoutRate: 0.01,
    referralPercent: 0,
    referralCurrency: 'UAH',
    merchantName: '',
  });
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    id: string;
    email: string;
    from: UserRole;
    to: UserRole;
    hasMerchant: boolean;
  } | null>(null);
  const [roleChangeMerchantName, setRoleChangeMerchantName] = useState('');
  const [pendingStatusToggle, setPendingStatusToggle] = useState<{
    id: string;
    email: string;
    nextActive: boolean;
  } | null>(null);

  const [directionsMerchant, setDirectionsMerchant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [legacyMerchantModal, setLegacyMerchantModal] = useState<{
    userId: string;
    email: string;
  } | null>(null);
  const [legacyMerchantName, setLegacyMerchantName] = useState('');

  const [limitsTrader, setLimitsTrader] = useState<PayoutLimitsTrader | null>(null);
  const [detailTraderId, setDetailTraderId] = useState<string | null>(null);
  const [detailTraderName, setDetailTraderName] = useState('');

  const { data: countries } = useQuery({
    queryKey: ['countries', 'active'],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; code: string; currency: string }>>(
        internalPaths.countriesQuery('activeOnly=true'),
      ),
  });

  const { data: staffCurrencies = [] } = useQuery({
    queryKey: ['currencies'],
    queryFn: fetchCurrencyList,
    enabled: showCreate,
  });

  const referralCurrencySelectOptions = useMemo(() => {
    const active = staffCurrencies
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.code, label: c.code }));
    const v = form.referralCurrency.trim().toUpperCase();
    if (v && !active.some((o) => o.value === v)) {
      active.push({ value: v, label: `${v} (inactive)` });
    }
    active.sort((a, b) => a.value.localeCompare(b.value));
    return active;
  }, [staffCurrencies, form.referralCurrency]);

  const invalidateDirectory = () => {
    void queryClient.invalidateQueries({ queryKey: [...directoryKey] });
  };

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
      if (payload.role === UserRole.REFERRAL) {
        body.referralPercent = payload.referralPercent;
        body.referralCurrency = payload.referralCurrency.trim() || 'UAH';
      }
      if (payload.role === UserRole.MERCHANT) {
        body.merchantName = payload.merchantName.trim();
      }
      return api.post<UsersApiRow>(internalPaths.users, body);
    },
    onSuccess: () => {
      invalidateDirectory();
      setShowCreate(false);
      setConfirmCreateOpen(false);
      setCreateFieldErrors({});
      createUser.reset();
      setForm({
        email: '',
        password: '',
        role: UserRole.TRADER,
        countryId: '',
        payoutRate: 0.01,
        referralPercent: 0,
        referralCurrency: 'UAH',
        merchantName: '',
      });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<UsersApiRow>(internalPaths.user(id), { isActive }),
    onSuccess: () => invalidateDirectory(),
  });

  const updateRole = useMutation({
    mutationFn: (payload: { id: string; role: UserRole; merchantName?: string }) => {
      const body: Record<string, unknown> = { role: payload.role };
      if (payload.merchantName?.trim()) body.merchantName = payload.merchantName.trim();
      return api.patch<UsersApiRow>(internalPaths.user(payload.id), body);
    },
    onSuccess: () => invalidateDirectory(),
  });

  const traderToggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? api.patch(internalPaths.traderActivate(id))
        : api.patch(internalPaths.traderDeactivate(id)),
    onSuccess: () => {
      invalidateDirectory();
      void queryClient.invalidateQueries({ queryKey: staffTraderKeys.list(queryKeyPrefix) });
    },
  });

  const merchantLockToggle = useMutation({
    mutationFn: ({ id, isLocked }: { id: string; isLocked: boolean }) =>
      isLocked ? api.patch(internalPaths.merchantUnlock(id)) : api.patch(internalPaths.merchantLock(id)),
    onSuccess: () => invalidateDirectory(),
  });

  const createLegacyMerchant = useMutation({
    mutationFn: (payload: { userId: string; name: string }) =>
      api.post(internalPaths.merchants, { userId: payload.userId, name: payload.name.trim() }),
    onSuccess: () => {
      invalidateDirectory();
      setLegacyMerchantModal(null);
      setLegacyMerchantName('');
    },
  });

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const columns = [
    {
      key: 'email',
      header: 'Email',
      render: (u: DirectoryUser) => (
        <div>
          <p className="font-medium text-text-primary">{u.email}</p>
          <p className="text-xs text-text-muted font-mono">{u.id.slice(0, 8)}…</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      className: 'text-center',
      render: (u: DirectoryUser) => (
        <Badge color={roleColors[u.role] ?? 'default'}>{roleLabel[u.role]}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (u: DirectoryUser) => (
        <Badge color={u.isActive ? 'green' : 'red'}>{u.isActive ? 'active' : 'inactive'}</Badge>
      ),
    },
    {
      key: 'profile',
      header: 'Profile',
      render: (u: DirectoryUser) => {
        if (u.role === UserRole.MERCHANT && u.merchant) {
          return (
            <div className="text-sm">
              <span className="text-text-primary">{u.merchant.name}</span>
              {u.merchant.isLock ? (
                <Badge color="red" className="ml-2">
                  locked
                </Badge>
              ) : null}
            </div>
          );
        }
        if (u.role === UserRole.MERCHANT && !u.merchant) {
          return <span className="text-xs text-amber-500">No merchant profile</span>;
        }
        if (u.role === UserRole.TRADER && u.traderProfile) {
          const p = u.traderProfile;
          return (
            <div className="text-xs text-text-secondary space-y-0.5">
              <span className={p.isActive ? 'text-success' : 'text-text-muted'}>
                Pay-In: {p.isActive ? 'Accepting' : 'Paused'}
              </span>
              <span className="block font-mono text-text-muted">
                {p.payoutMinLimit === 0 && p.payoutMaxLimit === 0
                  ? 'Payout limits: none'
                  : `Payout: ${p.payoutMinLimit} – ${p.payoutMaxLimit}`}
              </span>
            </div>
          );
        }
        if (u.role === UserRole.PAYOUT_TRADER && u.payoutTraderProfile) {
          return <span className="text-xs text-text-muted">Pay-Out specialist assigned</span>;
        }
        return <span className="text-text-muted">—</span>;
      },
    },
    {
      key: 'created',
      header: 'Created',
      render: (u: DirectoryUser) => (
        <span className="text-sm text-text-secondary">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-end',
      render: (u: DirectoryUser) => (
        <div
          className="flex flex-nowrap items-center justify-end gap-1 overflow-x-auto overscroll-x-contain"
          onClick={(e) => e.stopPropagation()}
        >
          {u.role === UserRole.MERCHANT && u.merchant ? (
            <>
              <IconButton
                label="Directions & commissions"
                variant="ghost"
                onClick={() => setDirectionsMerchant({ id: u.merchant!.id, name: u.merchant!.name })}
              >
                <Percent className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={u.merchant.isLock ? 'Unlock merchant account' : 'Lock merchant account'}
                variant={u.merchant.isLock ? 'success' : 'danger'}
                onClick={() =>
                  merchantLockToggle.mutate({ id: u.merchant!.id, isLocked: u.merchant!.isLock })
                }
              >
                {u.merchant.isLock ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              </IconButton>
            </>
          ) : null}
          {u.role === UserRole.MERCHANT && !u.merchant ? (
            <Button
              size="sm"
              variant="secondary"
              type="button"
              className="!py-1 !text-xs"
              onClick={() => {
                setLegacyMerchantModal({ userId: u.id, email: u.email });
                setLegacyMerchantName('');
              }}
            >
              Create merchant profile
            </Button>
          ) : null}
          {u.role === UserRole.TRADER && u.traderProfile ? (
            <>
              <IconButton
                label="Set payout limits"
                variant="ghost"
                onClick={() =>
                  setLimitsTrader({
                    id: u.traderProfile!.id,
                    name: u.email.split('@')[0] ?? 'Trader',
                    payoutMinLimit: u.traderProfile!.payoutMinLimit ?? 0,
                    payoutMaxLimit: u.traderProfile!.payoutMaxLimit ?? 0,
                  })
                }
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={u.traderProfile.isActive ? 'Pause Pay-In trader' : 'Resume Pay-In trader'}
                variant="ghost"
                onClick={() =>
                  traderToggle.mutate({
                    id: u.traderProfile!.id,
                    enabled: !u.traderProfile!.isActive,
                  })
                }
              >
                {u.traderProfile.isActive ? (
                  <ToggleRight className="h-3.5 w-3.5" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
              </IconButton>
              <IconButton
                label="Trader details"
                variant="ghost"
                onClick={() => {
                  setDetailTraderId(u.traderProfile!.id);
                  setDetailTraderName(u.email.split('@')[0] ?? 'Trader');
                }}
              >
                <span className="text-xs font-medium">⋯</span>
              </IconButton>
            </>
          ) : null}
          {!canUpdateRole(u.role) ? (
            <Badge
              color={roleColors[u.role] ?? 'default'}
              className="min-w-[5rem] shrink-0 justify-center"
            >
              {roleLabel[u.role]}
            </Badge>
          ) : (
            <Select
              options={assignableStaffRoles}
              rootClassName="w-[7rem] shrink-0 gap-1"
              value={pendingRoleChange?.id === u.id ? pendingRoleChange.from : u.role}
              onChange={(e) => {
                const nextRole = e.target.value as UserRole;
                if (nextRole === u.role) return;
                setPendingRoleChange({
                  id: u.id,
                  email: u.email,
                  from: u.role,
                  to: nextRole,
                  hasMerchant: !!u.merchant,
                });
                setRoleChangeMerchantName('');
              }}
              className="!h-9 !min-h-9 !py-1 !px-2 !text-xs"
            />
          )}
          <IconButton
            label={
              u.role === UserRole.OWNER && u.isActive
                ? 'Owner accounts cannot be deactivated'
                : u.isActive
                  ? 'Deactivate user'
                  : 'Activate user'
            }
            variant={u.isActive ? 'danger' : 'success'}
            disabled={u.role === UserRole.OWNER && u.isActive}
            onClick={() =>
              setPendingStatusToggle({
                id: u.id,
                email: u.email,
                nextActive: !u.isActive,
              })
            }
          >
            {u.isActive ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      ),
    },
  ];

  const needMerchantNameForRoleChange =
    pendingRoleChange?.to === UserRole.MERCHANT && !pendingRoleChange.hasMerchant;

  return (
    <div className="space-y-4">
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
                Pay-Out specialist with payout rate {form.payoutRate}. Double-check geo before confirming.
              </span>
            ) : null}
            {form.role === UserRole.REFERRAL ? (
              <span className="block mt-2 text-text-muted">
                Referral agent with {form.referralPercent}% commission, currency {form.referralCurrency.trim() || '—'}.
              </span>
            ) : null}
            {form.role === UserRole.MERCHANT ? (
              <span className="block mt-2 text-text-muted">
                Merchant profile «{form.merchantName.trim()}» will be created automatically.
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
        onOpenChange={(next) => {
          if (!next) {
            setPendingRoleChange(null);
            setRoleChangeMerchantName('');
          }
        }}
        tone="danger"
        title="Change user role?"
        description={
          pendingRoleChange ? (
            <>
              Update <span className="font-medium text-text-primary">{pendingRoleChange.email}</span> from{' '}
              <strong>{roleLabel[pendingRoleChange.from]}</strong> to{' '}
              <strong>{roleLabel[pendingRoleChange.to]}</strong>?
              {needMerchantNameForRoleChange ? (
                <div className="mt-3 space-y-1 text-left">
                  <label className="text-xs text-text-muted block">
                    Merchant display name (required for new merchant profile)
                  </label>
                  <Input
                    value={roleChangeMerchantName}
                    onChange={(e) => setRoleChangeMerchantName(e.target.value)}
                    placeholder="Acme Corp"
                    className="!py-2"
                  />
                </div>
              ) : null}
            </>
          ) : null
        }
        confirmLabel="Change role"
        loading={updateRole.isPending}
        confirmDisabled={
          !!(
            pendingRoleChange &&
            pendingRoleChange.to === UserRole.MERCHANT &&
            !pendingRoleChange.hasMerchant &&
            !roleChangeMerchantName.trim()
          )
        }
        onConfirm={() => {
          if (!pendingRoleChange) return;
          if (needMerchantNameForRoleChange && !roleChangeMerchantName.trim()) return;
          updateRole.mutate(
            {
              id: pendingRoleChange.id,
              role: pendingRoleChange.to,
              merchantName: needMerchantNameForRoleChange ? roleChangeMerchantName : undefined,
            },
            {
              onSettled: () => {
                setPendingRoleChange(null);
                setRoleChangeMerchantName('');
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={!!pendingStatusToggle}
        onOpenChange={(next) => !next && setPendingStatusToggle(null)}
        tone={pendingStatusToggle?.nextActive ? 'default' : 'danger'}
        title={pendingStatusToggle?.nextActive ? 'Activate this user?' : 'Deactivate this user?'}
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

      <FilterBar dense>
        <div
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border-subtle/70 bg-bg-secondary/30 px-2 shadow-sm"
          title="Total users matching current filters"
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue"
            aria-hidden
          >
            <Users className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5 pr-1">
            <span className="text-2xl font-bold tabular-nums leading-none tracking-tight text-text-primary">
              {isLoading ? '—' : total.toLocaleString()}
            </span>
            <span className="text-[11px] font-medium text-text-muted">users</span>
          </div>
        </div>
        <FilterInput
          compact
          label="Search"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by email…"
          className="min-w-[16rem] flex-1 basis-0 sm:min-w-[18rem]"
        />
        <FilterSelect
          compact
          narrow
          label="Role"
          value={roleFilter}
          onChange={setRoleFilter}
          options={roleFilterOptions}
        />
        <FilterSelect
          compact
          narrow
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <Button
          size="sm"
          className="ml-auto h-9 shrink-0 gap-1.5 px-3"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Create user
        </Button>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        totalPages={totalPages}
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
            options={assignableStaffRoles}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            error={createFieldErrors.role}
          />
          {form.role === UserRole.MERCHANT && (
            <Input
              label="Merchant display name"
              value={form.merchantName}
              onChange={(e) => setForm({ ...form, merchantName: e.target.value })}
              placeholder="Acme Corp"
              error={createFieldErrors.merchantName}
            />
          )}
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
                onChange={(e) => setForm({ ...form, payoutRate: parseFloat(e.target.value) || 0 })}
                error={createFieldErrors.payoutRate}
              />
            </>
          )}
          {form.role === UserRole.REFERRAL && (
            <>
              <Input
                label="Referral commission (percent, 0–100)"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={String(form.referralPercent)}
                onChange={(e) =>
                  setForm({ ...form, referralPercent: parseFloat(e.target.value) || 0 })
                }
                error={createFieldErrors.referralPercent}
              />
              <CurrencySelectWithCreate
                label="Referral balance currency"
                placeholder="Select currency"
                options={referralCurrencySelectOptions}
                value={form.referralCurrency}
                onChange={(e) => setForm({ ...form, referralCurrency: e.target.value.toUpperCase() })}
                error={createFieldErrors.referralCurrency}
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

      <Modal
        open={!!legacyMerchantModal}
        onClose={() => {
          setLegacyMerchantModal(null);
          setLegacyMerchantName('');
        }}
        title="Create merchant profile"
      >
        {legacyMerchantModal ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!legacyMerchantName.trim()) return;
              createLegacyMerchant.mutate({
                userId: legacyMerchantModal.userId,
                name: legacyMerchantName,
              });
            }}
          >
            <p className="text-sm text-text-muted">
              Link a payment profile to <strong>{legacyMerchantModal.email}</strong>.
            </p>
            <Input
              label="Merchant display name"
              value={legacyMerchantName}
              onChange={(e) => setLegacyMerchantName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setLegacyMerchantModal(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={createLegacyMerchant.isPending} disabled={!legacyMerchantName.trim()}>
                Create
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <MerchantDirectionsModal
        queryKeyPrefix={queryKeyPrefix}
        merchantId={directionsMerchant?.id ?? null}
        merchantName={directionsMerchant?.name ?? ''}
        open={!!directionsMerchant}
        onClose={() => setDirectionsMerchant(null)}
        onChanged={invalidateDirectory}
      />

      <PayoutLimitsModal
        trader={limitsTrader}
        onClose={() => setLimitsTrader(null)}
        queryPrefix={queryKeyPrefix}
      />

      <TraderDetailModal
        open={!!detailTraderId}
        onClose={() => setDetailTraderId(null)}
        traderId={detailTraderId}
        traderName={detailTraderName}
        queryPrefix={queryKeyPrefix}
      />
    </div>
  );
}

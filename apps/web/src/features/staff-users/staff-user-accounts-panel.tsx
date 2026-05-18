'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  Plus,
  Users,
  ShieldCheck,
  ShieldOff,
  Percent,
  Lock,
  Unlock,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Settings,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { CurrencySelectWithCreate } from '@/features/currencies/currency-select-with-create';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar, FilterInput, FilterSelect } from '@/components/ui/filters';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { errorMessageFromUnknown } from '@/lib/error-message';
import { formatDateTime } from '@/lib/utils';
import {
  countryKeys,
  currencyKeys,
  cascadeKeys,
  fetchCountryList,
  fetchCurrencyList,
  staffKeys,
} from '@/lib/query-keys';
import { CountrySelectWithCreate } from '@/features/countries/country-select-with-create';
import { parseDecimalInput } from '@/lib/decimal-input';
import { ownerCreateUserFormSchema } from '@/lib/validation/schemas';
import { fieldErrorsFromZod } from '@/lib/validation/zod-field-errors';
import {
  staffTraderKeys,
  TraderDetailModal,
  type StaffRolePrefix,
} from '@/features/traders';
import { MerchantDirectionsModal } from './merchant-directions-modal';
import { ReferralAgentManageModal } from './referral-agent-manage-modal';
import type { CascadeMethodPolicy } from '@/features/cascade/cascade-types';

const CASCADE_METHOD_HINT =
  'Fork, Card, and Provider targets are configured on the global cascade dashboard (must sum to 100%). Trader multiplier adjusts idle-time race speed within each tier.';

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
  referralProfile: {
    id: string;
    referralPercent: number;
    balance: number;
    currencyCode: string;
    linkedCount: number;
  } | null;
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

async function fetchMerchantProfileForUser(userId: string): Promise<{ id: string; name: string } | null> {
  try {
    return await api.get<{ id: string; name: string }>(internalPaths.merchantByUserId(userId));
  } catch {
    return null;
  }
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
  const directoryKey = staffKeys.usersDirectory(queryKeyPrefix);

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
  const debouncedSearch = useDebouncedValue(searchInput, 350, (v) => v.trim());
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setPage(1);
    setRoleFilter('');
    setSearchInput('');
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
    overdraftLimitUsdt: 0,
    payinRate: 0,
    traderPayoutRate: 0,
    payoutMinLimit: 0,
    payoutMaxLimit: 0,
    processingMethod: 'CARD' as 'CARD' | 'FORK',
    cascadeRatingMultiplier: 1,
    referralPercent: 0,
    referralCurrency: 'UAH',
    merchantName: '',
  });
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [pendingStatusToggle, setPendingStatusToggle] = useState<{
    id: string;
    email: string;
    nextActive: boolean;
  } | null>(null);

  const [directionsMerchant, setDirectionsMerchant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [merchantProfileCreateModal, setMerchantProfileCreateModal] = useState<{
    userId: string;
    email: string;
  } | null>(null);
  const [referralManage, setReferralManage] = useState<{
    profileId: string;
    email: string;
  } | null>(null);
  const [merchantProfileCreateName, setMerchantProfileCreateName] = useState('');
  const [traderDetailId, setTraderDetailId] = useState<string | null>(null);

  const { data: countries } = useQuery({
    queryKey: countryKeys.active,
    queryFn: () => fetchCountryList({ activeOnly: true }),
    enabled: showCreate,
  });

  const { data: staffCurrencies = [] } = useQuery({
    queryKey: currencyKeys.list(),
    queryFn: fetchCurrencyList,
    enabled: showCreate,
  });

  const { data: methodPolicy } = useQuery({
    queryKey: cascadeKeys.methodPolicy(),
    queryFn: () => api.get<CascadeMethodPolicy>(internalPaths.adminCascadeMethodPolicy),
    enabled: showCreate && form.role === UserRole.TRADER,
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
    mutationFn: async (payload: typeof form) => {
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
      if (payload.role === UserRole.TRADER) {
        body.overdraftLimitUsdt = payload.overdraftLimitUsdt;
        body.payinRate = payload.payinRate;
        body.traderPayoutRate = payload.traderPayoutRate;
        body.payoutMinLimit = payload.payoutMinLimit;
        body.payoutMaxLimit = payload.payoutMaxLimit;
        body.processingMethod = payload.processingMethod;
        body.cascadeRatingMultiplier = payload.cascadeRatingMultiplier;
      }
      if (payload.role === UserRole.MERCHANT) {
        body.merchantName = payload.merchantName.trim();
      }
      const row = await api.post<UsersApiRow>(internalPaths.users, body);
      const merchantProfile =
        payload.role === UserRole.MERCHANT ? await fetchMerchantProfileForUser(row.id) : null;
      return { merchantProfile, createdRole: payload.role };
    },
    onSuccess: (result) => {
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
        overdraftLimitUsdt: 0,
        payinRate: 0,
        traderPayoutRate: 0,
        payoutMinLimit: 0,
        payoutMaxLimit: 0,
        processingMethod: 'CARD',
        cascadeRatingMultiplier: 1,
        referralPercent: 0,
        referralCurrency: 'UAH',
        merchantName: '',
      });
      if (result.merchantProfile) {
        setDirectionsMerchant({
          id: result.merchantProfile.id,
          name: result.merchantProfile.name,
        });
      }
      if (result.createdRole === UserRole.TRADER) {
        void queryClient.invalidateQueries({ queryKey: cascadeKeys.methodPolicy() });
      }
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<UsersApiRow>(internalPaths.user(id), { isActive }),
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

  const createMerchantProfile = useMutation({
    mutationFn: (payload: { userId: string; name: string }) =>
      api.post<{ id: string; name: string }>(internalPaths.merchants, {
        userId: payload.userId,
        name: payload.name.trim(),
      }),
    onSuccess: (merchant) => {
      invalidateDirectory();
      setMerchantProfileCreateModal(null);
      setMerchantProfileCreateName('');
      setDirectionsMerchant({ id: merchant.id, name: merchant.name });
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
                Pay-In & Pay-Out: {p.isActive ? 'enabled' : 'blocked'}
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
        if (u.role === UserRole.REFERRAL && u.referralProfile) {
          const p = u.referralProfile;
          return (
            <div className="text-xs text-text-secondary space-y-0.5">
              <span>
                {p.referralPercent}% · {p.currencyCode}
              </span>
              <span className="block font-mono text-text-muted">
                Balance {p.balance.toFixed(4)} · Linked {p.linkedCount}
              </span>
            </div>
          );
        }
        if (u.role === UserRole.REFERRAL && !u.referralProfile) {
          return (
            <span className="text-xs text-amber-500">
              Profile missing — use the refer icon in Actions to refresh, or reload the page.
            </span>
          );
        }
        return <span className="text-text-muted">—</span>;
      },
    },
    {
      key: 'created',
      header: 'Created',
      render: (u: DirectoryUser) => (
        <span className="text-sm text-text-secondary">
          {formatDateTime(new Date(u.createdAt))}
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
                <Percent className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={u.merchant.isLock ? 'Unlock merchant account' : 'Lock merchant account'}
                variant={u.merchant.isLock ? 'success' : 'danger'}
                onClick={() =>
                  merchantLockToggle.mutate({ id: u.merchant!.id, isLocked: u.merchant!.isLock })
                }
              >
                {u.merchant.isLock ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
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
                setMerchantProfileCreateModal({ userId: u.id, email: u.email });
                setMerchantProfileCreateName('');
              }}
            >
              Create merchant profile
            </Button>
          ) : null}
          {u.role === UserRole.TRADER && u.traderProfile ? (
            <>
              <IconButton
                label="Trader settings (balances, limits, requisites)"
                variant="ghost"
                onClick={() =>
                  setTraderDetailId(u.traderProfile!.id)
                }
              >
                <Settings className="h-4 w-4" />
              </IconButton>
              <IconButton
                tooltipWide
                label={
                  u.traderProfile.isActive
                    ? 'Deactivate trader profile (blocks new Pay-In and Pay-Out assignments; returns payout tasks to the pool)'
                    : 'Activate trader profile (allows new Pay-In and Pay-Out assignments)'
                }
                variant="ghost"
                onClick={() =>
                  traderToggle.mutate({
                    id: u.traderProfile!.id,
                    enabled: !u.traderProfile!.isActive,
                  })
                }
              >
                {u.traderProfile.isActive ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </IconButton>
            </>
          ) : null}
          {u.role === UserRole.REFERRAL ? (
            <IconButton
              label={
                u.referralProfile
                  ? 'Referral agent: linked users & commission'
                  : 'Refresh list — missing referral profile will be created automatically'
              }
              variant="ghost"
              onClick={() => {
                if (u.referralProfile) {
                  setReferralManage({
                    profileId: u.referralProfile.id,
                    email: u.email,
                  });
                } else {
                  invalidateDirectory();
                }
              }}
            >
              <UserPlus className="h-4 w-4" />
            </IconButton>
          ) : null}
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
            {u.isActive ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </IconButton>
        </div>
      ),
    },
  ];

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
            {form.role === UserRole.TRADER ? (
              <span className="block mt-2 text-text-muted">
                Trader: overdraft {form.overdraftLimitUsdt} USDT, pay-in rate {form.payinRate}, pay-out rate{' '}
                {form.traderPayoutRate}. Pool visible range{' '}
                {form.payoutMinLimit === 0 && form.payoutMaxLimit === 0
                  ? 'unlimited'
                  : `${form.payoutMinLimit} – ${form.payoutMaxLimit}`}
                . Pay-In cascade: method {form.processingMethod}, race multiplier{' '}
                {form.cascadeRatingMultiplier}.
              </span>
            ) : null}
            {form.role === UserRole.REFERRAL ? (
              <span className="block mt-2 text-text-muted">
                Referral agent with {form.referralPercent}% commission, currency {form.referralCurrency.trim() || '—'}.
              </span>
            ) : null}
            {form.role === UserRole.MERCHANT ? (
              <span className="block mt-2 text-text-muted">
                Merchant profile «{form.merchantName.trim()}» will be created automatically. You can set Pay-In /
                Pay-Out directions and commissions next.
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
          <Plus className="h-4 w-4" /> Create user
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
          {form.role === UserRole.TRADER && (
            <>
              <div className="rounded-lg border border-border-subtle/70 bg-bg-secondary/20 py-3 space-y-3">
                <p className="text-xs font-medium text-text-muted">Trader defaults (optional)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="min-w-0 sm:col-span-2">
                    <NumberInput
                      label="Overdraft limit (USDT)"
                      variant="amount"
                      min={0}
                      value={form.overdraftLimitUsdt}
                      onChange={(e) =>
                        setForm({ ...form, overdraftLimitUsdt: parseDecimalInput(e.target.value) || 0 })
                      }
                      error={createFieldErrors.overdraftLimitUsdt}
                    />
                  </div>
                  <NumberInput
                    label="Pay-In rate (fraction)"
                    variant="rate"
                    min={0}
                    value={form.payinRate}
                    onChange={(e) =>
                      setForm({ ...form, payinRate: parseDecimalInput(e.target.value) || 0 })
                    }
                    error={createFieldErrors.payinRate}
                  />
                  <NumberInput
                    label="Pay-Out rate (fraction)"
                    variant="rate"
                    min={0}
                    value={form.traderPayoutRate}
                    onChange={(e) =>
                      setForm({ ...form, traderPayoutRate: parseDecimalInput(e.target.value) || 0 })
                    }
                    error={createFieldErrors.traderPayoutRate}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle/70 bg-bg-secondary/20 py-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Pay-In cascade routing</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Processing method (CARD vs FORK) controls Fork autolimits and which tier a requisite
                    joins in the Pay-In cascade. Traders cannot change this themselves.
                  </p>
                </div>
                <Select
                  label="Processing method"
                  options={[
                    { value: 'CARD', label: 'CARD' },
                    { value: 'FORK', label: 'FORK' },
                  ]}
                  value={form.processingMethod}
                  onChange={(e) =>
                    setForm({ ...form, processingMethod: e.target.value as 'CARD' | 'FORK' })
                  }
                  error={createFieldErrors.processingMethod}
                />
                <NumberInput
                  label="Cascade rating multiplier (0.01–100)"
                  variant="amount"
                  min={0.01}
                  max={100}
                  value={form.cascadeRatingMultiplier}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cascadeRatingMultiplier: parseDecimalInput(e.target.value) || 1,
                    })
                  }
                  error={createFieldErrors.cascadeRatingMultiplier}
                />
                {methodPolicy ? (
                  <p
                    className={`text-xs ${methodPolicy.matches_rule ? 'text-text-muted' : 'text-accent-yellow'}`}
                  >
                    Method targets sum: {methodPolicy.method_share_sum_percent.toFixed(2)}%.{' '}
                    {methodPolicy.matches_rule
                      ? 'Within policy.'
                      : 'Does not match policy yet — fix Fork / Card / Provider percentages on the cascade dashboard.'}
                  </p>
                ) : null}
                <p className="text-xs text-text-muted">{CASCADE_METHOD_HINT}</p>
              </div>
              <div className="rounded-lg border border-border-subtle/70 bg-bg-secondary/20 py-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Payout pool limits</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Min and max order amounts visible in the pool. Use 0 for no limit.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <NumberInput
                    label="Min amount (0 = no min)"
                    variant="amount"
                    min={0}
                    value={form.payoutMinLimit}
                    onChange={(e) =>
                      setForm({ ...form, payoutMinLimit: parseDecimalInput(e.target.value) || 0 })
                    }
                    error={createFieldErrors.payoutMinLimit}
                    placeholder="0"
                  />
                  <NumberInput
                    label="Max amount (0 = no max)"
                    variant="amount"
                    min={0}
                    value={form.payoutMaxLimit}
                    onChange={(e) =>
                      setForm({ ...form, payoutMaxLimit: parseDecimalInput(e.target.value) || 0 })
                    }
                    error={createFieldErrors.payoutMaxLimit}
                    placeholder="0"
                  />
                </div>
              </div>
            </>
          )}
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
              <CountrySelectWithCreate
                label="Geo / country"
                options={
                  countries?.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.code}) — ${c.currency}`,
                  })) ?? []
                }
                value={form.countryId}
                onChange={(e) => setForm({ ...form, countryId: e.target.value })}
                placeholder="Select country"
                error={createFieldErrors.countryId}
              />
              <NumberInput
                label="Payout rate (fraction, e.g. 0.01 = 1%)"
                variant="rate"
                min={0}
                value={form.payoutRate}
                onChange={(e) =>
                  setForm({ ...form, payoutRate: parseDecimalInput(e.target.value) || 0 })
                }
                error={createFieldErrors.payoutRate}
              />
            </>
          )}
          {form.role === UserRole.REFERRAL && (
            <>
              <NumberInput
                label="Referral commission (percent, 0–100)"
                variant="percent"
                suffix="%"
                min={0}
                max={100}
                value={form.referralPercent}
                onChange={(e) =>
                  setForm({ ...form, referralPercent: parseDecimalInput(e.target.value) || 0 })
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
        open={!!merchantProfileCreateModal}
        onClose={() => {
          setMerchantProfileCreateModal(null);
          setMerchantProfileCreateName('');
        }}
        title="Create merchant profile"
      >
        {merchantProfileCreateModal ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!merchantProfileCreateName.trim()) return;
              createMerchantProfile.mutate({
                userId: merchantProfileCreateModal.userId,
                name: merchantProfileCreateName,
              });
            }}
          >
            <p className="text-sm text-text-muted">
              Link a payment profile to <strong>{merchantProfileCreateModal.email}</strong>. Directions & commissions can be set right after creation.
            </p>
            <Input
              label="Merchant display name"
              value={merchantProfileCreateName}
              onChange={(e) => setMerchantProfileCreateName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMerchantProfileCreateModal(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMerchantProfile.isPending} disabled={!merchantProfileCreateName.trim()}>
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

      <TraderDetailModal
        open={!!traderDetailId}
        onClose={() => setTraderDetailId(null)}
        traderId={traderDetailId}
        queryPrefix={queryKeyPrefix}
      />

      <ReferralAgentManageModal
        queryKeyPrefix={queryKeyPrefix}
        open={!!referralManage}
        profileId={referralManage?.profileId ?? null}
        agentEmail={referralManage?.email ?? ''}
        onClose={() => setReferralManage(null)}
        onChanged={invalidateDirectory}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { LogOut, Menu, Power, PowerOff, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { payoutCabinetKeys, traderKeys } from '@/lib/query-keys';
import { Tooltip } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/theme-toggle';
import { TraderLocaleSwitch } from '@/components/trader-locale-switch';
import { TraderHeaderBalance } from '@/components/trader-header-balance';
import { TraderHeaderCapacityAlerts } from '@/components/trader-header-capacity-alerts';
import { isNavHrefActive } from '@/lib/nav-active';
import type { PayInListApiResponse } from '@/features/trader-payin/payin-types';

export type NavItemSidebarBadge = 'payin-current' | 'payout-pool';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Red count badge; uses lightweight list/pool requests (limit=1). */
  navBadge?: NavItemSidebarBadge;
}

interface DashboardShellProps {
  children: React.ReactNode;
  navItems: NavItem[];
  role: string;
}

interface TraderAcceptingOrdersResponse {
  accepting_orders: boolean;
  account_active: boolean;
}

interface PayOutListTotalResponse {
  total: number;
}

function useTraderSidebarBadgeData(role: string) {
  const payinQuery = useQuery({
    queryKey: traderKeys.payinNavBadge(),
    queryFn: () =>
      api
        .get<PayInListApiResponse>(internalPaths.traderPayinOrders, {
          list: 'current',
          page: '1',
          limit: '1',
        })
        .then((r) => r.total),
    enabled: role === 'trader',
    staleTime: 10_000,
  });

  const payoutTraderPool = useQuery({
    queryKey: payoutCabinetKeys.payoutPoolNavBadge('trader'),
    queryFn: () =>
      api
        .get<PayOutListTotalResponse>(`${internalPaths.payoutCabinetTrader}/pool`, {
          page: '1',
          limit: '1',
        })
        .then((r) => r.total),
    enabled: role === 'trader',
    staleTime: 10_000,
  });

  const payoutSpecialistPool = useQuery({
    queryKey: payoutCabinetKeys.payoutPoolNavBadge('payout-trader'),
    queryFn: () =>
      api
        .get<PayOutListTotalResponse>(`${internalPaths.payoutCabinetSpecialist}/pool`, {
          page: '1',
          limit: '1',
        })
        .then((r) => r.total),
    enabled: role === 'payout-trader',
    staleTime: 10_000,
  });

  return { payinQuery, payoutTraderPool, payoutSpecialistPool };
}

function resolveNavBadgeCount(
  item: NavItem,
  role: string,
  data: ReturnType<typeof useTraderSidebarBadgeData>,
): number | undefined {
  if (item.navBadge === 'payin-current' && role === 'trader') {
    return data.payinQuery.data;
  }
  if (item.navBadge === 'payout-pool') {
    if (role === 'trader') return data.payoutTraderPool.data;
    if (role === 'payout-trader') return data.payoutSpecialistPool.data;
  }
  return undefined;
}

function SidebarNavBadge({
  count,
  label,
  ariaLabel,
}: {
  count: number | undefined;
  label: string;
  ariaLabel?: string;
}) {
  if (count === undefined || count < 1) return null;
  const text = count > 99 ? '99+' : String(count);
  const fullAria = ariaLabel ?? `${label}: ${count} pending`;
  return (
    <span
      className="pointer-events-none absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-[3px] text-[8px] font-bold leading-none text-white tabular-nums shadow-sm ring-1 ring-red-600/30"
      aria-label={fullAria}
    >
      {text}
    </span>
  );
}

function DashboardSidebarNavLink({
  item,
  firstHref,
  pathname,
  badgeCount,
  badgeAriaLabel,
  onNavigate,
}: {
  item: NavItem;
  firstHref: string;
  pathname: string;
  badgeCount: number | undefined;
  badgeAriaLabel?: string;
  onNavigate: () => void;
}) {
  const isActive = isNavHrefActive(pathname, item.href, firstHref);
  const showBadge = badgeCount !== undefined && badgeCount > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={clsx(
        'relative flex min-h-10 items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm font-medium transition-colors',
        showBadge && 'pr-5',
        isActive
          ? 'bg-accent-muted text-accent-hover'
          : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary',
      )}
    >
      <item.icon className="h-4.5 w-4.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <SidebarNavBadge count={badgeCount} label={item.label} ariaLabel={badgeAriaLabel} />
    </Link>
  );
}

/** Same payload shape as dashboard stats; avoids a separate GET that may 404 on older API builds. */
interface TraderDashboardStatsToggleFields {
  accepting_orders?: boolean;
  account_active?: boolean;
}

/** Header pill: online / offline for Pay-In + Pay-Out intake (trader self-service). */
function TraderHeaderOrderStatus() {
  const t = useTranslations('Trader.HeaderStatus');
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: traderKeys.dashboardStats(),
    queryFn: () =>
      api.get<TraderDashboardStatsToggleFields>(internalPaths.traderDashboardStats),
    select: (s) => ({
      accepting_orders: s.accepting_orders ?? true,
      account_active: s.account_active ?? true,
    }),
  });

  const mutation = useMutation({
    mutationFn: (accepting_orders: boolean) =>
      api.patch<TraderAcceptingOrdersResponse>(internalPaths.tradersMeAcceptingOrders, {
        accepting_orders,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: traderKeys.dashboardStats() });
    },
  });

  const accountSuspended = data != null && data.account_active === false;
  const disabled = isLoading || isError || accountSuspended || mutation.isPending;
  const accepting = data?.accepting_orders ?? true;
  const isOnline = accepting && !accountSuspended;

  const tooltipContent = isLoading
    ? t('loadingTooltip')
    : isError
      ? t('errorTooltip')
      : accountSuspended
        ? t('suspendedTooltip')
        : accepting
          ? t('onlineTooltip')
          : t('offlineTooltip');

  const label = isLoading
    ? t('labelLoading')
    : accountSuspended
      ? t('labelSuspended')
      : accepting
        ? t('labelOnline')
        : t('labelOffline');

  const pill = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) mutation.mutate(!accepting);
      }}
      className={clsx(
          'inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-colors sm:px-3',
          disabled && 'cursor-not-allowed opacity-60',
          accountSuspended && 'bg-surface-tertiary text-text-muted border border-border-primary',
          !accountSuspended &&
            accepting &&
            'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/75 dark:text-emerald-400 dark:ring-emerald-500/35',
          !accountSuspended && !accepting && 'bg-surface-tertiary text-text-secondary border border-border-primary',
        )}
      aria-pressed={accepting && !accountSuspended}
      aria-label={
        accountSuspended
          ? t('ariaSuspended')
          : accepting
            ? t('ariaOnline')
            : t('ariaOffline')
      }
    >
      {accountSuspended || !accepting ? (
        <PowerOff className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      ) : (
        <Power className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      )}
      <span className="hidden sm:inline">{label}</span>
      <span
        className={clsx(
          'h-2 w-2 shrink-0 rounded-full',
          isLoading && 'bg-text-muted',
          accountSuspended && 'bg-text-muted',
          !accountSuspended && accepting && 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
          !accountSuspended && !accepting && 'bg-text-muted',
        )}
        aria-hidden
      />
    </button>
  );

  return (
    <Tooltip content={tooltipContent} side="bottom" wide>
      {pill}
    </Tooltip>
  );
}

export function DashboardShell({ children, navItems, role }: DashboardShellProps) {
  const pathname = usePathname();
  const tShell = useTranslations('Trader.Shell');
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarBadges = useTraderSidebarBadgeData(role);

  return (
    <div className="fixed inset-0 z-30 flex overflow-hidden bg-surface-primary">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border-primary bg-surface-secondary transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border-primary px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-bold text-white text-sm">
              P2P
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary capitalize">{role}</p>
              <p className="text-xs text-text-muted">
                {role === 'trader' ? tShell('panelBrand') : 'Panel'}
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-tertiary lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const badgeCount = resolveNavBadgeCount(item, role, sidebarBadges);
            const badgeAriaLabel =
              role === 'trader' && badgeCount !== undefined && badgeCount >= 1
                ? tShell('badgePending', { label: item.label, count: badgeCount })
                : undefined;
            return (
              <DashboardSidebarNavLink
                key={item.href}
                item={item}
                firstHref={navItems[0].href}
                pathname={pathname}
                badgeCount={badgeCount}
                badgeAriaLabel={badgeAriaLabel}
                onNavigate={() => setSidebarOpen(false)}
              />
            );
          })}
        </nav>

        <div className="border-t border-border-primary p-4">
          {role !== 'trader' && role !== 'payout-trader' && (
            <div className="mb-3 hidden justify-end lg:flex">
              <ThemeToggle />
            </div>
          )}
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-text-secondary">
              {user?.email?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{user?.email ?? '—'}</p>
              <p className="text-xs text-text-muted capitalize">{user?.role ?? role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-tertiary hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
            {role === 'trader' ? tShell('signOut') : 'Sign out'}
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header
          className={clsx(
            'flex h-14 shrink-0 items-center gap-2 border-b border-border-primary bg-surface-secondary/50 px-3 backdrop-blur-sm sm:h-16 sm:gap-3 sm:px-6',
            role === 'trader' || role === 'payout-trader' ? '' : 'lg:hidden',
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2.5 text-text-secondary hover:bg-surface-tertiary lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {role === 'trader' || role === 'payout-trader' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain">
              {role === 'trader' ? (
                <>
                  <TraderHeaderBalance />
                  <TraderHeaderCapacityAlerts />
                </>
              ) : null}
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary capitalize">
              {`${role} Panel`}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <ThemeToggle />
            {role === 'trader' && <TraderLocaleSwitch />}
            {role === 'trader' && <TraderHeaderOrderStatus />}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-primary">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

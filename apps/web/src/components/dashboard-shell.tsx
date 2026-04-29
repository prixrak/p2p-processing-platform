'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { LogOut, Menu, Power, PowerOff, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { Tooltip } from '@/components/ui/tooltip';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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

/** Same payload shape as dashboard stats; avoids a separate GET that may 404 on older API builds. */
interface TraderDashboardStatsToggleFields {
  accepting_orders?: boolean;
  account_active?: boolean;
}

/** Header pill: online / offline for Pay-In + Pay-Out intake (trader self-service). */
function TraderHeaderOrderStatus() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trader', 'dashboard-stats'],
    queryFn: () =>
      api.get<TraderDashboardStatsToggleFields>('/api/trader/dashboard/stats'),
    select: (s) => ({
      accepting_orders: s.accepting_orders ?? true,
      account_active: s.account_active ?? true,
    }),
  });

  const mutation = useMutation({
    mutationFn: (accepting_orders: boolean) =>
      api.patch<TraderAcceptingOrdersResponse>('/api/traders/me/accepting-orders', {
        accepting_orders,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trader', 'dashboard-stats'] });
    },
  });

  const accountSuspended = data != null && data.account_active === false;
  const disabled = isLoading || isError || accountSuspended || mutation.isPending;
  const accepting = data?.accepting_orders ?? true;
  const isOnline = accepting && !accountSuspended;

  const tooltipContent =
    isLoading ? (
      'Loading your availability status…'
    ) : isError ? (
      'Could not load status. Refresh the page or try again.'
    ) : accountSuspended ? (
      'Trading is suspended by an administrator. Contact support.'
    ) : accepting ? (
      <>
        You are <strong>online</strong>: new Pay-In and Pay-Out assignments can reach you. Click to go offline and
        pause.
      </>
    ) : (
      <>
        You are <strong>offline</strong>: no new Pay-In or Pay-Out assignments. Click to go online.
      </>
    );

  const label = isLoading ? '…' : accountSuspended ? 'Suspended' : accepting ? 'Online' : 'Offline';

  const pill = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) mutation.mutate(!accepting);
      }}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
        accountSuspended && 'bg-surface-tertiary text-text-muted ring-1 ring-border-secondary',
        !accountSuspended && accepting && 'bg-emerald-950/75 text-emerald-400 ring-1 ring-emerald-500/35',
        !accountSuspended && !accepting && 'bg-surface-tertiary text-text-secondary ring-1 ring-border-secondary',
      )}
      aria-pressed={accepting && !accountSuspended}
      aria-label={
        accountSuspended
          ? 'Trading suspended by administrator'
          : accepting
            ? 'Online — click to pause new orders'
            : 'Offline — click to receive new orders'
      }
    >
      {accountSuspended || !accepting ? (
        <PowerOff className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      ) : (
        <Power className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      )}
      <span>{label}</span>
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
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
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
              <p className="text-xs text-text-muted">Panel</p>
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
            const isActive = pathname === item.href || (item.href !== navItems[0].href && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent-hover'
                    : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary',
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-primary p-4">
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
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header
          className={clsx(
            'flex h-16 shrink-0 items-center gap-3 border-b border-border-primary bg-surface-secondary/50 px-4 backdrop-blur-sm sm:px-6',
            role === 'trader' || role === 'payout-trader' ? '' : 'lg:hidden',
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-tertiary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary capitalize">
            {role} Panel
          </span>
          {role === 'trader' && <TraderHeaderOrderStatus />}
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

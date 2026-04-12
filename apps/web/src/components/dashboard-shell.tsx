'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

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
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-primary bg-surface-secondary/50 px-6 backdrop-blur-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-tertiary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-text-primary capitalize">{role} Panel</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  MessageSquareWarning,
  BarChart3,
  Settings,
  Send,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { isNavHrefActive } from '@/lib/nav-active';

const traderNavItems = [
  { label: 'Dashboard', href: '/trader', icon: LayoutDashboard },
  { label: 'Pay-In', href: '/trader/payin', icon: ArrowDownToLine },
  { label: 'Pay-Out', href: '/trader/payout', icon: ArrowUpFromLine },
  { label: 'Requisites', href: '/trader/requisites', icon: CreditCard },
  { label: 'Appeals', href: '/trader/appeals', icon: MessageSquareWarning },
  { label: 'Statistics', href: '/trader/statistics', icon: BarChart3 },
  { label: 'Telegram', href: '/trader/telegram', icon: Send },
  { label: 'Settings', href: '/trader/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        'flex flex-col h-screen border-r border-border-primary bg-bg-secondary transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border-primary px-4">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue font-bold text-white text-sm">
              P2P
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Trader</p>
              <p className="text-xs text-text-muted">Panel</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {traderNavItems.map((item) => {
          const isActive = isNavHrefActive(pathname, item.href, '/trader');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-blue/10 text-accent-blue'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-primary p-3">
        {!collapsed && user && (
          <div className="mb-2 px-2">
            <p className="text-sm text-text-primary truncate">{user.email}</p>
            <p className="text-xs text-text-muted capitalize">{user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-accent-red hover:bg-bg-hover transition-colors"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

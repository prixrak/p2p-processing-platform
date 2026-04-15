'use client';

import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  MessageSquareWarning,
  BarChart3,
  Send,
  Settings,
  Wallet,
} from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const TRADER_ALLOWED = ['TRADER'] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/trader', icon: LayoutDashboard },
  { label: 'Pay-In', href: '/trader/payin', icon: ArrowDownToLine },
  { label: 'Pay-Out', href: '/trader/payout', icon: ArrowUpFromLine },
  { label: 'Requisites', href: '/trader/requisites', icon: CreditCard },
  { label: 'Balance', href: '/trader/balance', icon: Wallet },
  { label: 'Appeals', href: '/trader/appeals', icon: MessageSquareWarning },
  { label: 'Statistics', href: '/trader/statistics', icon: BarChart3 },
  { label: 'Telegram', href: '/trader/telegram', icon: Send },
  { label: 'Settings', href: '/trader/settings', icon: Settings },
];

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={TRADER_ALLOWED}>
      <DashboardShell navItems={navItems} role="trader">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

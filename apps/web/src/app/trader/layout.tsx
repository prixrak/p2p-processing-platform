'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  MessageSquareWarning,
  BarChart3,
  PieChart,
  Send,
  Settings,
  Wallet,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { useTraderWalletDepositRealtime } from '@/lib/payin-realtime';

const TRADER_ALLOWED = [UserRole.TRADER] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/trader', icon: LayoutDashboard },
  { label: 'Pay-In', href: '/trader/payin', icon: ArrowDownToLine, navBadge: 'payin-current' },
  { label: 'Pay-Out', href: '/trader/payout', icon: ArrowUpFromLine, navBadge: 'payout-pool' },
  { label: 'Analytics', href: '/trader/analytics', icon: PieChart },
  { label: 'Requisites', href: '/trader/requisites', icon: CreditCard },
  { label: 'Balance', href: '/trader/balance', icon: Wallet },
  { label: 'Appeals', href: '/trader/appeals', icon: MessageSquareWarning },
  { label: 'Statistics', href: '/trader/statistics', icon: BarChart3 },
  { label: 'Telegram', href: '/trader/telegram', icon: Send },
  { label: 'Settings', href: '/trader/settings', icon: Settings },
];

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useTraderWalletDepositRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={TRADER_ALLOWED}>
      <DashboardShell navItems={navItems} role="trader">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

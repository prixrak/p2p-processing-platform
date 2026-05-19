'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ArrowUpFromLine,
  Wallet,
  BarChart3,
  Bell,
  Send,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { usePayOutSpecialistRealtime, usePayoutTraderTelegramRealtime } from '@/lib/payin-realtime';

const PAYOUT_TRADER_ALLOWED = [UserRole.PAYOUT_TRADER] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/payout-trader', icon: LayoutDashboard },
  { label: 'Pay-Out', href: '/payout-trader/payout', icon: ArrowUpFromLine, navBadge: 'payout-pool' },
  { label: 'Statistics', href: '/payout-trader/statistics', icon: BarChart3 },
  { label: 'Balance', href: '/payout-trader/balance', icon: Wallet },
  { label: 'Telegram', href: '/payout-trader/telegram', icon: Send },
  { label: 'Notifications', href: '/payout-trader/notifications', icon: Bell },
];

export default function PayoutTraderLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  usePayOutSpecialistRealtime(queryClient);
  usePayoutTraderTelegramRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={PAYOUT_TRADER_ALLOWED}>
      <DashboardShell navItems={navItems} role="payout-trader">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

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
import { useTranslations } from 'next-intl';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import {
  usePayOutTraderRealtime,
  usePayinTraderRealtime,
  useTraderTelegramRealtime,
  useTraderWalletDepositRealtime,
} from '@/lib/payin-realtime';

const TRADER_ALLOWED = [UserRole.TRADER] as const;

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const t = useTranslations('Trader.Nav');

  const navItems: NavItem[] = [
    { label: t('dashboard'), href: '/trader', icon: LayoutDashboard },
    { label: t('payin'), href: '/trader/payin', icon: ArrowDownToLine, navBadge: 'payin-current' },
    { label: t('payout'), href: '/trader/payout', icon: ArrowUpFromLine, navBadge: 'payout-pool' },
    { label: t('requisites'), href: '/trader/requisites', icon: CreditCard },
    { label: t('appeals'), href: '/trader/appeals', icon: MessageSquareWarning },
    { label: t('balance'), href: '/trader/balance', icon: Wallet },
    { label: t('analytics'), href: '/trader/analytics', icon: PieChart },
    { label: t('statistics'), href: '/trader/statistics', icon: BarChart3 },
    { label: t('telegram'), href: '/trader/telegram', icon: Send },
    { label: t('settings'), href: '/trader/settings', icon: Settings },
  ];

  // Keep SSE alive across trader routes so lists refresh off Pay-In/Pay-Out/dashboard pages too.
  usePayinTraderRealtime(queryClient);
  usePayOutTraderRealtime(queryClient);
  useTraderWalletDepositRealtime(queryClient);
  useTraderTelegramRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={TRADER_ALLOWED}>
      <DashboardShell navItems={navItems} role="trader">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

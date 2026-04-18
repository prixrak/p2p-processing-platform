'use client';

import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Key,
  Webhook,
  BarChart3,
  Percent,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { useMerchantOrdersRealtime } from '@/lib/payin-realtime';

const MERCHANT_ALLOWED = [UserRole.MERCHANT] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/merchant', icon: LayoutDashboard },
  { label: 'Orders', href: '/merchant/orders', icon: ArrowLeftRight },
  { label: 'Balances', href: '/merchant/balances', icon: Wallet },
  { label: 'Directions', href: '/merchant/directions', icon: Percent },
  { label: 'API Keys', href: '/merchant/api-keys', icon: Key },
  { label: 'Webhooks', href: '/merchant/webhooks', icon: Webhook },
  { label: 'Analytics', href: '/merchant/analytics', icon: BarChart3 },
];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useMerchantOrdersRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={MERCHANT_ALLOWED}>
      <DashboardShell navItems={navItems} role="merchant">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FileText, AlertTriangle, Wallet, GitFork, Table2 } from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { useStaffOrdersRealtime } from '@/lib/payin-realtime';

const SUPPORT_ALLOWED = [UserRole.SUPPORT] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/support', icon: LayoutDashboard },
  { label: 'Orders', href: '/support/orders', icon: FileText },
  { label: 'Disputes', href: '/support/disputes', icon: AlertTriangle },
  { label: 'Balances', href: '/support/balances', icon: Wallet },
  { label: 'Cascade', href: '/support/cascade', icon: GitFork },
  { label: 'Cascade requisites', href: '/support/cascade/requisites', icon: Table2 },
];

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useStaffOrdersRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={SUPPORT_ALLOWED}>
      <DashboardShell navItems={navItems} role="support">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

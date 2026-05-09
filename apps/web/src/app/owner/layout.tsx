'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  FileText,
  ArrowLeftRight,
  Library,
  Wallet,
  BarChart3,
  ScrollText,
  CreditCard,
  GitFork,
  Table2,
  Percent,
  CircleDollarSign,
  FileSearch,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { useStaffOrdersRealtime } from '@/lib/payin-realtime';

const OWNER_ALLOWED = [UserRole.OWNER] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/owner', icon: LayoutDashboard },
  { label: 'Users', href: '/owner/users', icon: Users },
  { label: 'Orders', href: '/owner/orders', icon: FileText },
  { label: 'Treasury', href: '/owner/treasury', icon: CircleDollarSign },
  { label: 'Directions', href: '/owner/directions', icon: ArrowLeftRight },
  { label: 'Cascade', href: '/owner/cascade', icon: GitFork },
  { label: 'Cascade requisites', href: '/owner/cascade-requisites', icon: Table2 },
  { label: 'Pay-Out pool', href: '/owner/payout-pool', icon: Percent },
  { label: 'Reference', href: '/owner/catalog', icon: Library },
  { label: 'Payment Methods', href: '/owner/payment-methods', icon: CreditCard },
  { label: 'Settlements', href: '/owner/settlements', icon: Wallet },
  { label: 'Statistics', href: '/owner/statistics', icon: BarChart3 },
  { label: 'Orders logs', href: '/owner/orders-logs', icon: FileSearch },
  { label: 'Audit Log', href: '/owner/audit', icon: ScrollText },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useStaffOrdersRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={OWNER_ALLOWED}>
      <DashboardShell navItems={navItems} role="owner">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

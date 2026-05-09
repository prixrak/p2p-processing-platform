'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Landmark,
  BarChart3,
  ScrollText,
  Library,
  CreditCard,
  CircleDollarSign,
  GitFork,
  Percent,
  Table2,
  FileSearch,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { useStaffOrdersRealtime } from '@/lib/payin-realtime';

const ADMIN_ALLOWED = [UserRole.ADMIN] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ArrowLeftRight },
  { label: 'Treasury', href: '/admin/treasury', icon: CircleDollarSign },
  { label: 'Cascade', href: '/admin/cascade', icon: GitFork },
  { label: 'Cascade requisites', href: '/admin/cascade/requisites', icon: Table2 },
  { label: 'Pay-Out pool', href: '/admin/payout-pool', icon: Percent },
  { label: 'Settlements', href: '/admin/settlements', icon: Landmark },
  { label: 'Reference', href: '/admin/catalog', icon: Library },
  { label: 'Payment Methods', href: '/admin/payment-methods', icon: CreditCard },
  { label: 'Statistics', href: '/admin/statistics', icon: BarChart3 },
  { label: 'Orders logs', href: '/admin/orders-logs', icon: FileSearch },
  { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useStaffOrdersRealtime(queryClient);

  return (
    <AuthGuard allowedRoles={ADMIN_ALLOWED}>
      <DashboardShell navItems={navItems} role="admin">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

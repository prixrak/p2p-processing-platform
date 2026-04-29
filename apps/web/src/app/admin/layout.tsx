'use client';

import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Landmark,
  BarChart3,
  ScrollText,
  UserPlus,
  Globe,
  CreditCard,
  CircleDollarSign,
  GitFork,
} from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const ADMIN_ALLOWED = [UserRole.ADMIN] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Traders', href: '/admin/traders', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ArrowLeftRight },
  { label: 'Treasury', href: '/admin/treasury', icon: CircleDollarSign },
  { label: 'Cascade', href: '/admin/cascade', icon: GitFork },
  { label: 'Settlements', href: '/admin/settlements', icon: Landmark },
  { label: 'Referrals', href: '/admin/referrals', icon: UserPlus },
  { label: 'Countries', href: '/admin/countries', icon: Globe },
  { label: 'Payment Methods', href: '/admin/payment-methods', icon: CreditCard },
  { label: 'Statistics', href: '/admin/statistics', icon: BarChart3 },
  { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={ADMIN_ALLOWED}>
      <DashboardShell navItems={navItems} role="admin">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

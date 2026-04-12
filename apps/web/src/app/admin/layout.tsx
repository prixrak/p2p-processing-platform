'use client';

import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Landmark,
  BarChart3,
  ScrollText,
} from 'lucide-react';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Traders', href: '/admin/traders', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ArrowLeftRight },
  { label: 'Settlements', href: '/admin/settlements', icon: Landmark },
  { label: 'Statistics', href: '/admin/statistics', icon: BarChart3 },
  { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navItems={navItems} role="admin">
      {children}
    </DashboardShell>
  );
}

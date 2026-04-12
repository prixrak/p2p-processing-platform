'use client';

import {
  LayoutDashboard,
  Users,
  Store,
  UserCheck,
  FileText,
  ArrowLeftRight,
  Coins,
  Building2,
  Wallet,
  BarChart3,
  ScrollText,
} from 'lucide-react';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/owner', icon: LayoutDashboard },
  { label: 'Users', href: '/owner/users', icon: Users },
  { label: 'Merchants', href: '/owner/merchants', icon: Store },
  { label: 'Traders', href: '/owner/traders', icon: UserCheck },
  { label: 'Orders', href: '/owner/orders', icon: FileText },
  { label: 'Directions', href: '/owner/directions', icon: ArrowLeftRight },
  { label: 'Currencies', href: '/owner/currencies', icon: Coins },
  { label: 'Banks', href: '/owner/banks', icon: Building2 },
  { label: 'Settlements', href: '/owner/settlements', icon: Wallet },
  { label: 'Statistics', href: '/owner/statistics', icon: BarChart3 },
  { label: 'Audit Log', href: '/owner/audit', icon: ScrollText },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navItems={navItems} role="owner">
      {children}
    </DashboardShell>
  );
}

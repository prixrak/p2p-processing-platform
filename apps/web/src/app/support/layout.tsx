'use client';

import { LayoutDashboard, FileText, AlertTriangle, Wallet } from 'lucide-react';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/support', icon: LayoutDashboard },
  { label: 'Orders', href: '/support/orders', icon: FileText },
  { label: 'Disputes', href: '/support/disputes', icon: AlertTriangle },
  { label: 'Balances', href: '/support/balances', icon: Wallet },
];

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navItems={navItems} role="support">
      {children}
    </DashboardShell>
  );
}

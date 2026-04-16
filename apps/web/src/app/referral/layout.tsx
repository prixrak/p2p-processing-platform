'use client';

import { LayoutDashboard, BarChart3 } from 'lucide-react';
import { UserRole } from '@p2p/shared';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';

const REFERRAL_ALLOWED = [UserRole.REFERRAL] as const;

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/referral', icon: LayoutDashboard },
  { label: 'Statistics', href: '/referral/statistics', icon: BarChart3 },
];

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={REFERRAL_ALLOWED}>
      <DashboardShell navItems={navItems} role="referral">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

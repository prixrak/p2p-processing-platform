'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  Users,
  ArrowLeftRight,
  Percent,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { StatCard } from '@/components/ui/stat-card';

interface AdminStats {
  totalVolume: number;
  activeTraders: number;
  ordersToday: number;
  conversionRate: number;
  platformRevenue: number;
}

const quickLinks = [
  { label: 'Manage Traders', href: '/admin/traders', description: 'Enable, disable, and review traders' },
  { label: 'View Orders', href: '/admin/orders', description: 'Monitor all Pay-In and Pay-Out orders' },
  { label: 'Settlements', href: '/admin/settlements', description: 'Create and review settlements' },
  { label: 'Audit Log', href: '/admin/audit', description: 'Review all platform activity' },
];

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get(internalPaths.adminStats),
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Platform overview and key metrics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Volume"
          value={
            isLoading
              ? '...'
              : `$${(stats?.totalVolume ?? 0).toLocaleString()}`
          }
          icon={TrendingUp}
        />
        <StatCard
          label="Active Traders"
          value={isLoading ? '...' : String(stats?.activeTraders ?? 0)}
          icon={Users}
        />
        <StatCard
          label="Orders Today"
          value={isLoading ? '...' : String(stats?.ordersToday ?? 0)}
          icon={ArrowLeftRight}
        />
        <StatCard
          label="Conversion Rate"
          value={
            isLoading
              ? '...'
              : `${(stats?.conversionRate ?? 0).toFixed(1)}%`
          }
          icon={Percent}
        />
        <StatCard
          label="Platform Revenue"
          value={
            isLoading
              ? '...'
              : `$${(stats?.platformRevenue ?? 0).toLocaleString()}`
          }
          icon={DollarSign}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center justify-between p-4 bg-bg-card border border-border-primary rounded-xl hover:border-border-secondary transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                  {link.label}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{link.description}</p>
              </div>
              <ArrowRight
                size={16}
                className="text-text-muted group-hover:text-accent-blue transition-colors"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

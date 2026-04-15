'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Users,
  Store,
  FileText,
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { StatCard, Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PlatformStats {
  totalUsers: number;
  totalMerchants: number;
  totalOrders: number;
  totalVolume: number;
  activePayins: number;
  activePayouts: number;
  pendingSettlements: number;
  disputesCount: number;
  recentOrders: {
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }[];
}

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  COMPLETED: 'green',
  ACTIVE: 'blue',
  PENDING: 'yellow',
  FAILED: 'red',
  CANCELLED: 'red',
  DISPUTE: 'red',
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { data: stats } = useQuery({
    queryKey: ['owner', 'stats'],
    queryFn: () => api.get<PlatformStats>(internalPaths.adminStats),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Owner Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Full platform overview and management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers ?? '—'}
          icon={Users}
          href="/owner/users"
        />
        <StatCard
          title="Merchants"
          value={stats?.totalMerchants ?? '—'}
          icon={Store}
          href="/owner/merchants"
        />
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders?.toLocaleString() ?? '—'}
          icon={FileText}
          href="/owner/orders"
        />
        <StatCard
          title="Total Volume"
          value={stats?.totalVolume ? `$${stats.totalVolume.toLocaleString()}` : '—'}
          icon={TrendingUp}
          href="/owner/statistics"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Pay-Ins"
          value={stats?.activePayins ?? '—'}
          icon={ArrowDownLeft}
          href="/owner/orders"
        />
        <StatCard
          title="Active Pay-Outs"
          value={stats?.activePayouts ?? '—'}
          icon={ArrowUpRight}
          href="/owner/orders"
        />
        <StatCard
          title="Pending Settlements"
          value={stats?.pendingSettlements ?? '—'}
          icon={Wallet}
          href="/owner/settlements"
        />
        <StatCard
          title="Open Disputes"
          value={stats?.disputesCount ?? '—'}
          icon={AlertTriangle}
          href="/owner/orders"
          className={stats?.disputesCount ? 'border-danger/30' : ''}
        />
      </div>

      <Card title="Recent Orders">
        {stats?.recentOrders?.length ? (
          <div className="space-y-3">
            {stats.recentOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => router.push('/owner/orders')}
                className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary/50 px-4 py-3 cursor-pointer hover:border-border-secondary transition-colors"
              >
                <div className="flex items-center gap-3">
                  {order.type === 'PAYIN' ? (
                    <ArrowDownLeft className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-accent" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {order.type} — {order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">
                    {order.amount} {order.currency}
                  </span>
                  <Badge color={statusColor[order.status] ?? 'default'}>{order.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-text-muted">No recent orders</p>
        )}
      </Card>
    </div>
  );
}

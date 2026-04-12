'use client';

import { useQuery } from '@tanstack/react-query';
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
  const { data: stats } = useQuery({
    queryKey: ['owner', 'stats'],
    queryFn: () => api.get<PlatformStats>('/api/admin/stats'),
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
          trend={{ value: 12, positive: true }}
        />
        <StatCard
          title="Merchants"
          value={stats?.totalMerchants ?? '—'}
          icon={Store}
          trend={{ value: 5, positive: true }}
        />
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders?.toLocaleString() ?? '—'}
          icon={FileText}
          trend={{ value: 8, positive: true }}
        />
        <StatCard
          title="Total Volume"
          value={stats?.totalVolume ? `$${stats.totalVolume.toLocaleString()}` : '—'}
          icon={TrendingUp}
          trend={{ value: 15, positive: true }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Pay-Ins"
          value={stats?.activePayins ?? '—'}
          icon={ArrowDownLeft}
        />
        <StatCard
          title="Active Pay-Outs"
          value={stats?.activePayouts ?? '—'}
          icon={ArrowUpRight}
        />
        <StatCard
          title="Pending Settlements"
          value={stats?.pendingSettlements ?? '—'}
          icon={Wallet}
        />
        <StatCard
          title="Open Disputes"
          value={stats?.disputesCount ?? '—'}
          icon={AlertTriangle}
          className={stats?.disputesCount ? 'border-danger/30' : ''}
        />
      </div>

      <Card title="Recent Orders">
        {stats?.recentOrders?.length ? (
          <div className="space-y-3">
            {stats.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary/50 px-4 py-3"
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

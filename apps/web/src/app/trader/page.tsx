'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  CreditCard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
} from 'lucide-react';
import { StatCard, Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, shortId } from '@/lib/utils';
import type { PayInOrderStatus, PayOutOrderStatus } from '@p2p/shared';

interface DashboardStats {
  total_volume: number;
  orders_today: number;
  success_rate: number;
  active_requisites: number;
  currency: string;
}

interface RecentOrder {
  id: string;
  type: 'payin' | 'payout';
  amount: number;
  currency: string;
  status: PayInOrderStatus | PayOutOrderStatus;
  created_at: number;
}

const statusBadgeVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  PAID: 'success',
  COMPLETED: 'success',
  VERIFIED: 'info',
  PROCESSING: 'info',
  NEW: 'warning',
  PENDING: 'muted',
  CANCELED: 'danger',
  FAILED: 'danger',
  APPEAL: 'warning',
  UNDERPAID: 'warning',
  OVERPAID: 'warning',
  UPLOAD_FAILED: 'danger',
};

export default function TraderDashboard() {
  const router = useRouter();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['trader', 'dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/api/trader/dashboard/stats'),
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['trader', 'recent-orders'],
    queryFn: () => api.get<RecentOrder[]>('/api/trader/dashboard/recent-orders'),
  });

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (row: RecentOrder) => (
        <div className="flex items-center gap-2">
          {row.type === 'payin' ? (
            <ArrowDownToLine className="h-4 w-4 text-accent-green" />
          ) : (
            <ArrowUpFromLine className="h-4 w-4 text-accent-blue" />
          )}
          <span className="text-xs uppercase">{row.type === 'payin' ? 'Pay-In' : 'Pay-Out'}</span>
        </div>
      ),
    },
    {
      key: 'id',
      header: 'ID',
      render: (row: RecentOrder) => (
        <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row: RecentOrder) => (
        <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: RecentOrder) => (
        <Badge variant={statusBadgeVariant[row.status] ?? 'muted'} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: RecentOrder) => (
        <span className="text-text-muted">{formatDate(row.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Overview of your trading activity</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Volume"
          value={statsLoading ? '...' : formatCurrency(stats?.total_volume ?? 0, stats?.currency)}
          icon={TrendingUp}
          href="/trader/statistics"
        />
        <StatCard
          title="Orders Today"
          value={statsLoading ? '...' : (stats?.orders_today ?? 0)}
          icon={ShoppingCart}
          href="/trader/payin"
        />
        <StatCard
          title="Success Rate"
          value={statsLoading ? '...' : `${(stats?.success_rate ?? 0).toFixed(1)}%`}
          icon={CheckCircle2}
          href="/trader/statistics"
        />
        <StatCard
          title="Active Requisites"
          value={statsLoading ? '...' : (stats?.active_requisites ?? 0)}
          icon={CreditCard}
          href="/trader/requisites"
        />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Recent Orders</h2>
          </div>
        </div>
        <Table
          columns={columns}
          data={recentOrders ?? []}
          keyExtractor={(row) => row.id}
          loading={ordersLoading}
          emptyMessage="No recent orders"
          onRowClick={(row) => router.push(row.type === 'payin' ? '/trader/payin' : '/trader/payout')}
        />
      </Card>
    </div>
  );
}

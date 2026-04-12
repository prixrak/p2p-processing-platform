'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Clock, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { StatCard, Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SupportStats {
  activeDisputes: number;
  ordersNeedingAttention: number;
  avgResolutionTime: string;
  resolvedToday: number;
  recentDisputes: {
    id: string;
    orderId: string;
    merchantName: string;
    reason: string;
    status: string;
    createdAt: string;
  }[];
  flaggedOrders: {
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    reason: string;
  }[];
}

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'default'> = {
  OPEN: 'red',
  IN_PROGRESS: 'yellow',
  RESOLVED: 'green',
  CLOSED: 'default',
};

export default function SupportDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: () => api.get<SupportStats>('/api/support/stats'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Support Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Active disputes and orders needing attention</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Disputes"
          value={stats?.activeDisputes ?? '—'}
          icon={AlertTriangle}
          className={stats?.activeDisputes ? 'border-danger/30' : ''}
        />
        <StatCard
          title="Orders Needing Attention"
          value={stats?.ordersNeedingAttention ?? '—'}
          icon={FileText}
        />
        <StatCard
          title="Avg Resolution Time"
          value={stats?.avgResolutionTime ?? '—'}
          icon={Clock}
        />
        <StatCard
          title="Resolved Today"
          value={stats?.resolvedToday ?? '—'}
          icon={MessageSquare}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent Disputes">
          {stats?.recentDisputes?.length ? (
            <div className="space-y-3">
              {stats.recentDisputes.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary/50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Order {d.orderId.slice(0, 8)} — {d.merchantName}
                    </p>
                    <p className="text-xs text-text-muted">{d.reason}</p>
                  </div>
                  <Badge color={statusColor[d.status] ?? 'default'}>{d.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No active disputes</p>
          )}
        </Card>

        <Card title="Flagged Orders">
          {stats?.flaggedOrders?.length ? (
            <div className="space-y-3">
              {stats.flaggedOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border border-border-primary bg-surface-primary/50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {o.type} — {o.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted">{o.reason}</p>
                  </div>
                  <span className="font-mono text-sm text-text-primary">
                    {o.amount} {o.currency}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No flagged orders</p>
          )}
        </Card>
      </div>
    </div>
  );
}

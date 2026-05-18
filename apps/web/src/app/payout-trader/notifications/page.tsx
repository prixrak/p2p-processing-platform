'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { specialistCabinetKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  created_at: string;
  reference_id: string | null;
}

export default function PayoutTraderNotificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: specialistCabinetKeys.notifications(),
    queryFn: () => api.get<{ items: NotificationItem[] }>(internalPaths.payoutSpecialistNotifications),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Bell className="h-7 w-7 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Notifications</h1>
          <p className="text-sm text-text-muted">Ledger, settlements, and recent order outcomes</p>
        </div>
      </div>

      <Card className="divide-y divide-border-primary">
        {isLoading ? (
          <p className="p-6 text-text-muted text-sm">Loading…</p>
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="p-6 text-text-muted text-sm">No notifications yet.</p>
        ) : (
          data!.items.map((n) => (
            <div key={n.id} className="p-4 space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-sm font-medium text-text-primary">{n.title}</span>
                <span className="text-xs text-text-muted shrink-0">
                  {formatDateTime(new Date(n.created_at))}
                </span>
              </div>
              <p className="text-sm text-text-secondary">{n.message}</p>
              <p className="text-xs font-mono text-text-muted">{n.kind}</p>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

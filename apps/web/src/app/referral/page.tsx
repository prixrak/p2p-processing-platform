'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Wallet,
  TrendingUp,
  Percent,
  UserCheck,
  Store,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { referralKeys } from '@/lib/query-keys';
import { UserRole } from '@p2p/shared';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ReferralProfile {
  id: string;
  referralPercent: number;
  balance: number;
  currency: string;
  createdAt: string;
  user: { email: string; isActive: boolean };
  referrals: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
}

export default function ReferralDashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: referralKeys.me(),
    queryFn: () => api.get<ReferralProfile>(internalPaths.referralMe),
  });

  const traderCount = profile?.referrals.filter((u) => u.role === UserRole.TRADER).length ?? 0;
  const merchantCount = profile?.referrals.filter((u) => u.role === UserRole.MERCHANT).length ?? 0;
  const activeCount = profile?.referrals.filter((u) => u.isActive).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Referral Cabinet</h1>
          <p className="text-sm text-text-muted">{profile?.user.email ?? '—'}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-5 w-5 text-accent-green" />}
          label="My Balance"
          value={formatCurrency(profile?.balance ?? 0, profile?.currency ?? 'UAH')}
          loading={isLoading}
          accent="green"
        />
        <StatCard
          icon={<Percent className="h-5 w-5 text-accent-blue" />}
          label="Referral %"
          value={`${profile?.referralPercent ?? 0}%`}
          loading={isLoading}
          accent="blue"
        />
        <StatCard
          icon={<UserCheck className="h-5 w-5 text-accent-purple" />}
          label="Total Referred"
          value={String(profile?.referrals.length ?? 0)}
          sub={`${activeCount} active`}
          loading={isLoading}
          accent="purple"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-accent-orange" />}
          label="Traders / Merchants"
          value={`${traderCount} / ${merchantCount}`}
          loading={isLoading}
          accent="orange"
        />
      </div>

      {/* Referred users table */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Referred Users</h2>
          <a
            href="/referral/statistics"
            className="text-sm text-accent-blue hover:underline"
          >
            View full statistics →
          </a>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
          </div>
        ) : !profile?.referrals.length ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-primary">
            <p className="text-text-muted">No referred users yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="pb-3 text-left text-xs font-medium text-text-muted">Email</th>
                  <th className="pb-3 text-left text-xs font-medium text-text-muted">Role</th>
                  <th className="pb-3 text-left text-xs font-medium text-text-muted">Status</th>
                  <th className="pb-3 text-left text-xs font-medium text-text-muted">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {profile.referrals.map((user) => (
                  <tr key={user.id} className="hover:bg-bg-secondary/50 transition-colors">
                    <td className="py-3 text-text-primary">{user.email}</td>
                    <td className="py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="py-3">
                      <Badge variant={user.isActive ? 'success' : 'default'} dot>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 text-text-muted">
                      {formatDate(new Date(user.createdAt).getTime() / 1000)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent?: 'green' | 'blue' | 'purple' | 'orange';
}) {
  const accentMap: Record<string, string> = {
    green: 'border-accent-green/22 bg-accent-green/5',
    blue: 'border-accent-blue/22 bg-accent-blue/5',
    purple: 'border-accent-purple/22 bg-accent-purple/5',
    orange: 'border-accent-orange/22 bg-accent-orange/5',
  };

  return (
    <div
      className={`rounded-xl border p-4 ${accent ? accentMap[accent] : 'border-border-primary bg-bg-secondary'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      {loading ? (
        <div className="h-6 w-24 animate-pulse rounded bg-bg-tertiary" />
      ) : (
        <>
          <p className="text-xl font-bold text-text-primary">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
        </>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode }> = {
    TRADER: { label: 'Trader', icon: <TrendingUp className="h-3 w-3" /> },
    MERCHANT: { label: 'Merchant', icon: <Store className="h-3 w-3" /> },
  };
  const entry = map[role] ?? { label: role, icon: null };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
      {entry.icon}
      {entry.label}
    </span>
  );
}

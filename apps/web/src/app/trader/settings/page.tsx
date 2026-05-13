'use client';

import { Settings, User, Lock, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';

type TraderMeProfile = {
  processingMethod?: 'CARD' | 'FORK';
  cascadeRatingMultiplier?: unknown;
};

export default function SettingsPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: traderKeys.profile(),
    queryFn: () => api.get<TraderMeProfile>(internalPaths.traderMeProfile),
  });

  const method = profile?.processingMethod === 'FORK' ? 'FORK' : 'CARD';
  const multiplier = Number(profile?.cascadeRatingMultiplier ?? 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted">Manage your account preferences</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-text-muted">Name</span>
            <p className="text-sm text-text-primary">{user?.name ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Email</span>
            <p className="text-sm text-text-primary">{user?.email ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Role</span>
            <p className="text-sm text-text-primary">{user?.role ?? '-'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <GitBranch className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Pay-In routing</h2>
        </div>
        <div className="mb-4 space-y-3 text-sm text-text-muted">
          <p>
            Your assigned processing method (<span className="font-mono text-text-primary">CARD</span>{' '}
            or <span className="font-mono text-text-primary">FORK</span>) is configured by platform staff.
            Incoming Pay-Ins first route to Fork vs Card by global traffic %; inside your tier, idle time
            and your cascade rating multiplier decide who gets the next assignment. You cannot switch
            tiers yourself—contact support if you need a different mode.
          </p>
          <ul className="list-inside list-disc space-y-1 text-text-secondary">
            <li>
              Fork: <code className="text-xs">idle × max(fill_mult, trader_mult)</code>
              (fill_mult scales with confirmed volume; new requisites get a short start boost on the fill
              ladder).
            </li>
            <li>Card: idle × trader multiplier only (no fill ladder).</li>
            <li>
              If nothing matches on one tier, orders can fall back to the other tier and then to an
              external provider.
            </li>
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border-primary bg-bg-tertiary/40 px-4 py-3">
            <span className="text-xs text-text-muted">Method</span>
            <p className="mt-1 font-mono text-sm font-medium text-text-primary">{method}</p>
          </div>
          <div className="rounded-lg border border-border-primary bg-bg-tertiary/40 px-4 py-3">
            <span className="text-xs text-text-muted">Cascade rating multiplier</span>
            <p className="mt-1 font-mono text-sm font-medium text-text-primary">{multiplier}</p>
          </div>
        </div>
        {method === 'FORK' ? (
          <p className="mt-4 text-sm text-text-secondary">
            FORK (exchange-style) flows often take longer to confirm than direct card transfers.
            Typical confirmation may be on the order of several minutes rather than one or two.
          </p>
        ) : null}
        <p className="mt-4 text-sm">
          <Link
            href="/trader/requisites"
            className="text-accent-blue underline-offset-2 hover:underline"
          >
            View requisites and effective amount ranges
          </Link>
          {' — '}includes cascade-aware min/max per requisite.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Security</h2>
        </div>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-secondary">
          <p className="text-sm text-text-muted">Password change & 2FA management coming soon</p>
        </div>
      </Card>
    </div>
  );
}

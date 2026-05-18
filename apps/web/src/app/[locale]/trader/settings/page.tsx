'use client';

import { Settings, User, Lock, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Trader.Settings');
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
          <h1 className="text-2xl font-bold text-text-primary">{t('title')}</h1>
          <p className="text-sm text-text-muted">{t('subtitle')}</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">{t('profileTitle')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-text-muted">{t('labelName')}</span>
            <p className="text-sm text-text-primary">{user?.name ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">{t('labelEmail')}</span>
            <p className="text-sm text-text-primary">{user?.email ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">{t('labelRole')}</span>
            <p className="text-sm text-text-primary">{user?.role ?? '-'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <GitBranch className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">{t('routingTitle')}</h2>
        </div>
        <div className="mb-4 space-y-3 text-sm text-text-muted">
          <p className="leading-relaxed">
            {t.rich('routingIntro', {
              card: (chunks) => (
                <span className="font-mono text-text-primary">{chunks}</span>
              ),
              fork: (chunks) => (
                <span className="font-mono text-text-primary">{chunks}</span>
              ),
            })}
          </p>
          <ul className="list-inside list-disc space-y-1 text-text-secondary">
            <li>
              {t.rich('routingBulletFork', {
                code: (chunks) => (
                  <code className="text-xs text-text-primary">{chunks}</code>
                ),
              })}
            </li>
            <li>{t('routingBulletCard')}</li>
            <li>{t('routingBulletFallback')}</li>
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border-primary bg-bg-tertiary/40 px-4 py-3">
            <span className="text-xs text-text-muted">{t('labelMethod')}</span>
            <p className="mt-1 font-mono text-sm font-medium text-text-primary">{method}</p>
          </div>
          <div className="rounded-lg border border-border-primary bg-bg-tertiary/40 px-4 py-3">
            <span className="text-xs text-text-muted">{t('labelCascadeMultiplier')}</span>
            <p className="mt-1 font-mono text-sm font-medium text-text-primary">{multiplier}</p>
          </div>
        </div>
        {method === 'FORK' ? (
          <p className="mt-4 text-sm text-text-secondary">{t('forkNote')}</p>
        ) : null}
        <p className="mt-4 text-sm">
          <Link
            href="/trader/requisites"
            className="text-accent-blue underline-offset-2 hover:underline"
          >
            {t('requisiteLink')}
          </Link>
          {t('requisiteLinkSuffix')}
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">{t('securityTitle')}</h2>
        </div>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-secondary">
          <p className="text-sm text-text-muted">{t('securityPlaceholder')}</p>
        </div>
      </Card>
    </div>
  );
}

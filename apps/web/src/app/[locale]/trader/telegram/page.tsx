'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Send,
  Link2,
  Unlink,
  Bell,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wallet,
  ArrowDownCircle,
  CircleDollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { getTelegramBotUrl } from '@/lib/telegram-bot';
import { TelegramBotIdentity } from '@/components/telegram-bot-identity';
import { cn } from '@/lib/utils';

/** Matches Prisma / GET /api/telegram/settings response. */
interface TelegramSettingsApi {
  id: string;
  traderId: string;
  chatId: string | null;
  notifyPayin: boolean;
  notifyPayout: boolean;
  notifyAppeals: boolean;
  notifyLowPayinCapacity: boolean;
  notifyTopUpConfirm: boolean;
  notifyPayinCapacityExhausted: boolean;
  isActive: boolean;
  botUsername: string | null;
}

export default function TelegramPage() {
  const t = useTranslations('Trader.Telegram');
  const queryClient = useQueryClient();
  const [awaitingConnect, setAwaitingConnect] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: traderKeys.telegram(),
    queryFn: () => api.get<TelegramSettingsApi>(internalPaths.telegramSettings),
  });

  const isConnected = Boolean(settings?.isActive && settings?.chatId);
  const isAwaitingConnect = awaitingConnect && !isConnected;

  useEffect(() => {
    if (isConnected) setAwaitingConnect(false);
  }, [isConnected]);

  const connectMutation = useMutation({
    mutationFn: () =>
      api.post<{ token: string; botUsername: string | null }>(internalPaths.telegramConnect),
    onSuccess: (data) => {
      setAwaitingConnect(true);
      const url = getTelegramBotUrl(data.token, data.botUsername ?? settings?.botUsername);
      if (url) {
        window.open(url, '_blank');
      } else if (data.token) {
        void navigator.clipboard.writeText(data.token);
        alert(t('connectTokenAlert'));
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.telegramSettings, {
        isActive: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traderKeys.telegram() });
    },
  });

  const toggleNotification = useMutation({
    mutationFn: (
      update: Partial<
        Pick<
          TelegramSettingsApi,
          | 'notifyPayin'
          | 'notifyPayout'
          | 'notifyAppeals'
          | 'notifyLowPayinCapacity'
          | 'notifyTopUpConfirm'
          | 'notifyPayinCapacityExhausted'
        >
      >,
    ) => api.patch(internalPaths.telegramSettings, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traderKeys.telegram() });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('title')}</h1>
          <p className="text-sm text-text-muted">{t('subtitle')}</p>
        </div>
      </div>

      {isAwaitingConnect && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-blue/5 border border-accent-blue/20 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-accent-blue shrink-0" />
          <p className="text-sm text-text-secondary">{t('connectingHint')}</p>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl',
                isConnected ? 'bg-accent-green/10' : 'bg-bg-hover',
              )}
            >
              <Send
                className={cn(
                  'h-6 w-6',
                  isConnected ? 'text-accent-green' : 'text-text-muted',
                )}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">{t('botCardTitle')}</h2>
                <Badge variant={isConnected ? 'success' : isAwaitingConnect ? 'warning' : 'muted'} dot>
                  {isConnected
                    ? t('badgeConnected')
                    : isAwaitingConnect
                      ? t('badgeConnecting')
                      : t('badgeNotConnected')}
                </Badge>
              </div>
              {isConnected && settings?.chatId && (
                <p className="text-sm text-text-muted">
                  {t('chatLinked', { chatId: settings.chatId })}
                </p>
              )}
              {!isConnected && (
                <p className="text-sm text-text-muted">{t('connectHint')}</p>
              )}
              <TelegramBotIdentity
                className="mt-2"
                label={t('botIdentityLabel')}
                notConfiguredHint={t('botNotConfigured')}
                username={settings?.botUsername}
              />
            </div>
          </div>

          {isConnected ? (
            <Button
              variant="danger"
              onClick={() => disconnectMutation.mutate()}
              loading={disconnectMutation.isPending}
            >
              <Unlink className="h-4 w-4" />
              {t('disconnect')}
            </Button>
          ) : (
            <Button
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending || isAwaitingConnect}
              disabled={isAwaitingConnect}
            >
              <Link2 className="h-4 w-4" />
              {t('connectBot')}
            </Button>
          )}
        </div>
      </Card>

      <Card className={cn(!isConnected && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center gap-2 mb-6">
          <Bell className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">{t('prefsTitle')}</h2>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-green/10">
                <ArrowDownToLine className="h-4 w-4 text-accent-green" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('payinTitle')}</p>
                <p className="text-xs text-text-muted">{t('payinDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyPayin ?? false}
              onChange={(checked) => toggleNotification.mutate({ notifyPayin: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10">
                <ArrowUpFromLine className="h-4 w-4 text-accent-blue" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('payoutTitle')}</p>
                <p className="text-xs text-text-muted">{t('payoutDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyPayout ?? false}
              onChange={(checked) => toggleNotification.mutate({ notifyPayout: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-yellow/10">
                <AlertTriangle className="h-4 w-4 text-accent-yellow" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('appealsTitle')}</p>
                <p className="text-xs text-text-muted">{t('appealsDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyAppeals ?? false}
              onChange={(checked) => toggleNotification.mutate({ notifyAppeals: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="pt-4 border-t border-border-subtle">
            <div className="flex items-center gap-2 mb-3 px-4">
              <Wallet className="h-4 w-4 text-text-muted" />
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t('walletSection')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <ArrowDownCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('lowCapacityTitle')}</p>
                <p className="text-xs text-text-muted">{t('lowCapacityDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyLowPayinCapacity ?? true}
              onChange={(checked) => toggleNotification.mutate({ notifyLowPayinCapacity: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-green/10">
                <CircleDollarSign className="h-4 w-4 text-accent-green" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('topUpTitle')}</p>
                <p className="text-xs text-text-muted">{t('topUpDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyTopUpConfirm ?? true}
              onChange={(checked) => toggleNotification.mutate({ notifyTopUpConfirm: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('capacityExhaustedTitle')}</p>
                <p className="text-xs text-text-muted">{t('capacityExhaustedDesc')}</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyPayinCapacityExhausted ?? true}
              onChange={(checked) => toggleNotification.mutate({ notifyPayinCapacityExhausted: checked })}
              disabled={!isConnected}
            />
          </div>
        </div>
      </Card>

      {isConnected && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-green/5 border border-accent-green/20 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-accent-green shrink-0" />
          <p className="text-sm text-text-secondary">{t('footerActive')}</p>
        </div>
      )}
    </div>
  );
}

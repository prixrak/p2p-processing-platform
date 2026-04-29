'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
}

export default function TelegramPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['trader', 'telegram'],
    queryFn: () => api.get<TelegramSettingsApi>(internalPaths.telegramSettings),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post<{ token: string }>(internalPaths.telegramConnect),
    onSuccess: (data) => {
      const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
      if (bot && data.token) {
        window.open(`https://t.me/${bot}?start=${encodeURIComponent(data.token)}`, '_blank');
      } else if (data.token) {
        void navigator.clipboard.writeText(data.token);
        alert(
          'Connect token copied. Open your Telegram bot and send /start with this token if your deployment uses a custom linking flow.',
        );
      }
      queryClient.invalidateQueries({ queryKey: ['trader', 'telegram'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.telegramSettings, {
        isActive: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'telegram'] });
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
      queryClient.invalidateQueries({ queryKey: ['trader', 'telegram'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent-blue" />
      </div>
    );
  }

  const isConnected = Boolean(settings?.isActive && settings?.chatId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Telegram Notifications</h1>
          <p className="text-sm text-text-muted">Connect your Telegram to receive instant alerts</p>
        </div>
      </div>

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
                <h2 className="text-lg font-semibold text-text-primary">Telegram Bot</h2>
                <Badge variant={isConnected ? 'success' : 'muted'} dot>
                  {isConnected ? 'Connected' : 'Not Connected'}
                </Badge>
              </div>
              {isConnected && settings?.chatId && (
                <p className="text-sm text-text-muted">
                  Chat linked (id <span className="font-mono text-xs">{settings.chatId}</span>)
                </p>
              )}
              {!isConnected && (
                <p className="text-sm text-text-muted">
                  Connect the bot to receive notifications about your orders
                </p>
              )}
            </div>
          </div>

          {isConnected ? (
            <Button
              variant="danger"
              onClick={() => disconnectMutation.mutate()}
              loading={disconnectMutation.isPending}
            >
              <Unlink className="h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending}
            >
              <Link2 className="h-4 w-4" />
              Connect Bot
            </Button>
          )}
        </div>
      </Card>

      <Card className={cn(!isConnected && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center gap-2 mb-6">
          <Bell className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Notification Preferences</h2>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-green/10">
                <ArrowDownToLine className="h-4 w-4 text-accent-green" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Pay-In Notifications</p>
                <p className="text-xs text-text-muted">Get alerted when new pay-in orders arrive</p>
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
                <p className="text-sm font-medium text-text-primary">Pay-Out Notifications</p>
                <p className="text-xs text-text-muted">Get alerted when new pay-out orders arrive</p>
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
                <p className="text-sm font-medium text-text-primary">Appeals Notifications</p>
                <p className="text-xs text-text-muted">Get alerted when disputes need your attention</p>
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
                Balance & settlements (USDT)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <ArrowDownCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Low Pay-In capacity</p>
                <p className="text-xs text-text-muted">
                  When remaining USDT headroom (balance + overdraft) is at or below the operator threshold
                </p>
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
                <p className="text-sm font-medium text-text-primary">Top-up recorded</p>
                <p className="text-xs text-text-muted">When a USDT top-up is posted to your ledger</p>
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
                <p className="text-sm font-medium text-text-primary">Pay-In capacity exhausted</p>
                <p className="text-xs text-text-muted">
                  When there is no USDT headroom left for Pay-In assignment (you and ops may be notified)
                </p>
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
          <p className="text-sm text-text-secondary">
            Your Telegram bot is active. Notifications will be sent based on your preferences above.
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Link2,
  Unlink,
  Bell,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  CircleDollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { specialistCabinetKeys } from '@/lib/query-keys';
import { getTelegramBotUrl } from '@/lib/telegram-bot';
import { TelegramBotIdentity } from '@/components/telegram-bot-identity';
import { cn } from '@/lib/utils';

interface PayoutTraderTelegramSettingsApi {
  id: string;
  payoutTraderId: string;
  chatId: string | null;
  notifyNewPoolOrder: boolean;
  notifySettlement: boolean;
  isActive: boolean;
  botUsername: string | null;
}

export default function PayoutTraderTelegramPage() {
  const queryClient = useQueryClient();
  const [awaitingConnect, setAwaitingConnect] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: specialistCabinetKeys.telegram(),
    queryFn: () =>
      api.get<PayoutTraderTelegramSettingsApi>(internalPaths.payoutTraderTelegramSettings),
  });

  const isConnected = Boolean(settings?.isActive && settings?.chatId);
  const isAwaitingConnect = awaitingConnect && !isConnected;

  useEffect(() => {
    if (isConnected) setAwaitingConnect(false);
  }, [isConnected]);

  const connectMutation = useMutation({
    mutationFn: () =>
      api.post<{ token: string; botUsername: string | null }>(
        internalPaths.payoutTraderTelegramConnect,
      ),
    onSuccess: (data) => {
      setAwaitingConnect(true);
      const url = getTelegramBotUrl(data.token, data.botUsername ?? settings?.botUsername);
      if (url) {
        window.open(url, '_blank');
      } else if (data.token) {
        void navigator.clipboard.writeText(data.token);
        alert(
          'Connect token copied. Open your Telegram bot and send /start with this token.',
        );
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api.patch(internalPaths.payoutTraderTelegramSettings, {
        isActive: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specialistCabinetKeys.telegram() });
    },
  });

  const toggleNotification = useMutation({
    mutationFn: (
      update: Partial<Pick<PayoutTraderTelegramSettingsApi, 'notifyNewPoolOrder' | 'notifySettlement'>>,
    ) => api.patch(internalPaths.payoutTraderTelegramSettings, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specialistCabinetKeys.telegram() });
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
          <h1 className="text-2xl font-bold text-text-primary">Telegram Notifications</h1>
          <p className="text-sm text-text-muted">Connect Telegram for instant Pay-Out pool alerts</p>
        </div>
      </div>

      {isAwaitingConnect && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-blue/5 border border-accent-blue/20 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-accent-blue shrink-0" />
          <p className="text-sm text-text-secondary">
            Waiting for Telegram… Press Start in the bot — this page updates automatically.
          </p>
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
                <h2 className="text-lg font-semibold text-text-primary">Telegram Bot</h2>
                <Badge variant={isConnected ? 'success' : isAwaitingConnect ? 'warning' : 'muted'} dot>
                  {isConnected ? 'Connected' : isAwaitingConnect ? 'Connecting…' : 'Not Connected'}
                </Badge>
              </div>
              {isConnected && settings?.chatId && (
                <p className="text-sm text-text-muted">Chat linked (id {settings.chatId})</p>
              )}
              {!isConnected && (
                <p className="text-sm text-text-muted">
                  Connect the bot to receive pool and settlement notifications
                </p>
              )}
              <TelegramBotIdentity
                className="mt-2"
                label="Platform bot"
                notConfiguredHint="Telegram bot is not configured for this environment. Contact support."
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
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending || isAwaitingConnect}
              disabled={isAwaitingConnect}
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
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10">
                <ArrowUpFromLine className="h-4 w-4 text-accent-blue" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">New pool orders</p>
                <p className="text-xs text-text-muted">
                  When a new Pay-Out order appears in your currency pool
                </p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifyNewPoolOrder ?? true}
              onChange={(checked) => toggleNotification.mutate({ notifyNewPoolOrder: checked })}
              disabled={!isConnected}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-4 hover:bg-bg-hover transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-green/10">
                <CircleDollarSign className="h-4 w-4 text-accent-green" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Settlements</p>
                <p className="text-xs text-text-muted">When a settlement is recorded on your balance</p>
              </div>
            </div>
            <Toggle
              checked={settings?.notifySettlement ?? true}
              onChange={(checked) => toggleNotification.mutate({ notifySettlement: checked })}
              disabled={!isConnected}
            />
          </div>
        </div>
      </Card>

      {isConnected && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-green/5 border border-accent-green/20 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-accent-green shrink-0" />
          <p className="text-sm text-text-secondary">
            Your Telegram bot is active. Notifications follow your preferences above.
          </p>
        </div>
      )}
    </div>
  );
}

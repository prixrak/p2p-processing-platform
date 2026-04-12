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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TelegramSettings {
  is_connected: boolean;
  bot_username?: string;
  connect_url?: string;
  notifications: {
    payin: boolean;
    payout: boolean;
    appeals: boolean;
  };
}

export default function TelegramPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['trader', 'telegram'],
    queryFn: () => api.get<TelegramSettings>('/api/trader/telegram/settings'),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post<{ connect_url: string }>('/api/trader/telegram/connect'),
    onSuccess: (data) => {
      if (data.connect_url) {
        window.open(data.connect_url, '_blank');
      }
      queryClient.invalidateQueries({ queryKey: ['trader', 'telegram'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/trader/telegram/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trader', 'telegram'] });
    },
  });

  const toggleNotification = useMutation({
    mutationFn: (update: Partial<TelegramSettings['notifications']>) =>
      api.patch('/api/trader/telegram/notifications', update),
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

  const isConnected = settings?.is_connected ?? false;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Telegram Notifications</h1>
          <p className="text-sm text-text-muted">Connect your Telegram to receive instant alerts</p>
        </div>
      </div>

      {/* Connection Status */}
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
              {isConnected && settings?.bot_username && (
                <p className="text-sm text-text-muted">
                  Connected via @{settings.bot_username}
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

      {/* Notification Toggles */}
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
              checked={settings?.notifications.payin ?? false}
              onChange={(checked) => toggleNotification.mutate({ payin: checked })}
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
              checked={settings?.notifications.payout ?? false}
              onChange={(checked) => toggleNotification.mutate({ payout: checked })}
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
              checked={settings?.notifications.appeals ?? false}
              onChange={(checked) => toggleNotification.mutate({ appeals: checked })}
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

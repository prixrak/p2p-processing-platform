import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { config } from '@p2p/config';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../../common/utils/external-error-log';
import { TelegramService } from './telegram.service';

type TelegramMessage = {
  message_id?: number;
  chat?: { id?: number };
  text?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

const POLL_TIMEOUT_SEC = 30;

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private polling = false;
  private offset = 0;
  private abortController: AbortController | null = null;

  constructor(private readonly telegram: TelegramService) {}

  onModuleInit(): void {
    if (!config.telegram.botToken.trim()) {
      this.logger.log('TELEGRAM_BOT_TOKEN not set — bot handler disabled');
      return;
    }

    if (config.telegram.webhookUrl.trim()) {
      void this.registerWebhook();
      return;
    }

    this.polling = true;
    void this.runPollingLoop();
    this.logger.log('Telegram bot long polling started');
  }

  onModuleDestroy(): void {
    this.polling = false;
    this.abortController?.abort();
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || message.chat?.id == null) {
      return;
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (text.startsWith('/start')) {
      const token = text.replace(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+|$)/, '').trim() || undefined;
      if (!token) {
        await this.telegram.sendNotification(
          chatId,
          'Open <b>Telegram</b> settings in your cabinet, tap <b>Connect Bot</b>, then press Start in this chat.',
        );
        return;
      }

      await this.tryConnect(chatId, token);
      return;
    }

    // Accept a bare connect token if the user pasted it without /start
    if (/^[a-f0-9]{64}$/i.test(text)) {
      await this.tryConnect(chatId, text);
      return;
    }

    if (text === '/help') {
      await this.telegram.sendNotification(
        chatId,
        'Use <b>Connect Bot</b> in your cabinet to link this chat.\n/help — this message',
      );
    }
  }

  private async tryConnect(chatId: string, token: string): Promise<void> {
    try {
      await this.telegram.handleBotConnect(token, chatId);
      await this.telegram.sendNotification(
        chatId,
        '✅ <b>Connected</b>\nNotifications will follow your cabinet preferences.',
      );
    } catch {
      await this.telegram.sendNotification(
        chatId,
        '❌ Invalid or expired connect token.\nGenerate a new one in the cabinet and try again.',
      );
    }
  }

  private async registerWebhook(): Promise<void> {
    const url = `${this.apiBase()}/setWebhook`;
    const body: Record<string, unknown> = {
      url: config.telegram.webhookUrl.trim(),
      allowed_updates: ['message'],
    };
    const secret = config.telegram.webhookSecret.trim();
    if (secret) {
      body.secret_token = secret;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.http.telegramFetchTimeoutMs),
      });
      if (!res.ok) {
        const preview = await res.text().catch(() => '');
        logHttpResponseFailure(this.logger, {
          integration: 'Telegram Bot API',
          operation: 'setWebhook',
          status: res.status,
          statusText: res.statusText,
          bodyPreview: preview,
          level: 'error',
        });
        return;
      }
      this.logger.log(`Telegram webhook registered: ${String(body.url)}`);
    } catch (err) {
      logExternalFailure(this.logger, {
        integration: 'Telegram Bot API',
        operation: 'setWebhook',
        error: err,
        level: 'error',
      });
    }
  }

  private async runPollingLoop(): Promise<void> {
    while (this.polling) {
      this.abortController = new AbortController();
      try {
        const res = await fetch(
          `${this.apiBase()}/getUpdates?offset=${this.offset}&timeout=${POLL_TIMEOUT_SEC}`,
          {
            signal: this.abortController.signal,
          },
        );

        if (!res.ok) {
          const preview = await res.text().catch(() => '');
          logHttpResponseFailure(this.logger, {
            integration: 'Telegram Bot API',
            operation: 'getUpdates',
            status: res.status,
            statusText: res.statusText,
            bodyPreview: preview,
            level: 'warn',
          });
          await this.sleep(5_000);
          continue;
        }

        const payload = (await res.json()) as {
          ok?: boolean;
          result?: TelegramUpdate[];
        };

        if (!payload.ok || !Array.isArray(payload.result)) {
          await this.sleep(2_000);
          continue;
        }

        for (const update of payload.result) {
          if (typeof update.update_id === 'number') {
            this.offset = update.update_id + 1;
          }
          await this.handleUpdate(update);
        }
      } catch (err) {
        if (this.polling && !(err instanceof Error && err.name === 'AbortError')) {
          logExternalFailure(this.logger, {
            integration: 'Telegram Bot API',
            operation: 'getUpdates',
            error: err,
            level: 'warn',
          });
          await this.sleep(5_000);
        }
      }
    }
  }

  private apiBase(): string {
    return `https://api.telegram.org/bot${config.telegram.botToken}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { config } from '@p2p/config';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../common/utils/external-error-log';

interface TelegramJobData {
  chatId: string;
  message: string;
}

@Processor('telegram')
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name);

  async process(job: Job<TelegramJobData>): Promise<void> {
    const { chatId, message } = job.data;

    if (!config.telegram.botToken) {
      this.logger.warn('Telegram bot token not configured, skipping notification');
      return;
    }

    const controller = new AbortController();
    const timeoutMs = config.http.telegramFetchTimeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logHttpResponseFailure(this.logger, {
          integration: 'Telegram Bot API',
          operation: 'sendMessage',
          context: { chatId },
          status: res.status,
          statusText: res.statusText,
          bodyPreview: body,
          level: 'warn',
        });
        throw new Error(`Telegram API returned ${res.status}`);
      }

      this.logger.log(`Telegram message sent to chat ${chatId}`);
    } catch (err) {
      const skipDuplicate =
        err instanceof Error && err.message.startsWith('Telegram API returned');
      if (!skipDuplicate) {
        logExternalFailure(this.logger, {
          integration: 'Telegram Bot API',
          operation: 'sendMessage',
          context: { chatId },
          error: err,
        });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

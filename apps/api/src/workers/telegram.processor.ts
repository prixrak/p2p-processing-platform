import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { config } from '@p2p/config';

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
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`Telegram API error: ${res.status} ${body}`);
        throw new Error(`Telegram API returned ${res.status}`);
      }

      this.logger.log(`Telegram message sent to chat ${chatId}`);
    } catch (err) {
      this.logger.error(`Failed to send Telegram message: ${err}`);
      throw err;
    }
  }
}

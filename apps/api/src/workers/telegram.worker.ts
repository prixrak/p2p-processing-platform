import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TelegramService } from '../modules/telegram/telegram.service';

interface TelegramPayinJobData {
  type: 'payin';
  traderId: string;
  orderInfo: { id: string; amount: number; currency: string };
}

interface TelegramPayoutJobData {
  type: 'payout';
  traderId: string;
  orderInfo: { id: string; amount: number; currency: string };
}

interface TelegramAppealJobData {
  type: 'appeal';
  traderId: string;
  appealInfo: { id: string; orderId: string; paidAmount: number };
}

type TelegramJobData =
  | TelegramPayinJobData
  | TelegramPayoutJobData
  | TelegramAppealJobData;

@Injectable()
@Processor('telegram')
export class TelegramWorker extends WorkerHost {
  private readonly logger = new Logger(TelegramWorker.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<TelegramJobData>): Promise<void> {
    const { data } = job;

    this.logger.log(
      `Processing telegram notification: ${data.type} for trader ${data.traderId}`,
    );

    try {
      switch (data.type) {
        case 'payin':
          await this.telegramService.notifyNewPayin(
            data.traderId,
            data.orderInfo,
          );
          break;

        case 'payout':
          await this.telegramService.notifyNewPayout(
            data.traderId,
            data.orderInfo,
          );
          break;

        case 'appeal':
          await this.telegramService.notifyAppeal(
            data.traderId,
            data.appealInfo,
          );
          break;

        default:
          this.logger.warn(`Unknown telegram job type: ${(data as any).type}`);
      }
    } catch (err) {
      this.logger.error(
        `Telegram notification failed for trader ${data.traderId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

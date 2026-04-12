import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhooksService } from '../modules/webhooks/webhooks.service';
import { WEBHOOK_MAX_RETRIES } from '@p2p/shared';
import { PrismaService } from '../config/prisma.service';

interface WebhookJobData {
  outboxId: string;
}

@Injectable()
@Processor('webhook')
export class WebhookWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookWorker.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    if (job.name === 'poll-pending') {
      await this.pollPending();
      return;
    }

    if (job.name === 'send-webhook') {
      await this.sendWebhook(job.data.outboxId);
      return;
    }
  }

  private async pollPending(): Promise<void> {
    const pending = await this.webhooksService.getOutboxPending();

    for (const entry of pending) {
      try {
        await this.sendWebhook(entry.id);
      } catch (err) {
        this.logger.error(
          `Failed to process webhook outbox ${entry.id}: ${err}`,
        );
      }
    }
  }

  private async sendWebhook(outboxId: string): Promise<void> {
    const entry = await this.prisma.webhookOutbox.findUnique({
      where: { id: outboxId },
      include: {
        payinOrder: {
          select: {
            merchant: {
              select: {
                apiKeys: {
                  where: { direction: 'PAYIN', isActive: true },
                  take: 1,
                },
              },
            },
          },
        },
        payoutOrder: {
          select: {
            merchant: {
              select: {
                apiKeys: {
                  where: { direction: 'PAYOUT', isActive: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!entry) {
      this.logger.warn(`Outbox entry ${outboxId} not found, skipping`);
      return;
    }

    const payloadString = JSON.stringify(entry.payloadJson);

    const apiKeys =
      entry.payinOrder?.merchant?.apiKeys ??
      entry.payoutOrder?.merchant?.apiKeys ??
      [];

    let signature = '';
    if (apiKeys.length > 0) {
      signature = this.webhooksService.signWebhookPayload(
        payloadString,
        apiKeys[0].secretKeyHash,
      );
    }

    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const response = await fetch(entry.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
        signal: AbortSignal.timeout(10_000),
      });

      responseStatus = response.status;
      responseBody = await response.text().catch(() => null);

      if (response.ok) {
        await this.webhooksService.markSent(outboxId);
        this.logger.log(`Webhook ${outboxId} sent successfully`);
      } else {
        const newAttempts = entry.attempts + 1;
        await this.webhooksService.markFailed(outboxId, newAttempts);
        this.logger.warn(
          `Webhook ${outboxId} failed with status ${response.status}, attempt ${newAttempts}`,
        );
      }
    } catch (err) {
      const newAttempts = entry.attempts + 1;
      await this.webhooksService.markFailed(outboxId, newAttempts);
      responseBody = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Webhook ${outboxId} network error, attempt ${newAttempts}: ${responseBody}`,
      );
    }

    await this.webhooksService.logAttempt(
      outboxId,
      entry.callbackUrl,
      entry.payloadJson as any,
      responseStatus,
      responseBody,
    );
  }
}

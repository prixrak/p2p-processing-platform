import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { PrismaService } from '../config/prisma.service';
import { WEBHOOK_MAX_RETRIES, WEBHOOK_RETRY_DELAYS_MS } from '@p2p/shared';

interface WebhookJobData {
  outboxId: string;
}

@Processor('webhook')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { outboxId } = job.data;

    const outbox = await this.prisma.webhookOutbox.findUnique({
      where: { id: outboxId },
      include: {
        payinOrder: { include: { merchant: { include: { apiKeys: { where: { isActive: true } } } } } },
        payoutOrder: { include: { merchant: { include: { apiKeys: { where: { isActive: true } } } } } },
      },
    });

    if (!outbox) {
      this.logger.warn(`Outbox entry ${outboxId} not found, skipping`);
      return;
    }

    if (outbox.status === 'SENT' || outbox.status === 'DLQ') {
      return;
    }

    const merchant = outbox.payinOrder?.merchant ?? outbox.payoutOrder?.merchant;
    const apiKey = merchant?.apiKeys?.[0];
    const signingKey = apiKey?.secretKeyHash ?? '';

    const payloadStr = JSON.stringify(outbox.payloadJson);
    const signature = createHmac('sha512', signingKey)
      .update(payloadStr)
      .digest('hex');

    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(outbox.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
          'X-Webhook-Id': outbox.id,
        },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseStatus = res.status;
      responseBody = await res.text().catch(() => null);

      await this.prisma.webhookLog.create({
        data: {
          outboxId,
          callbackUrl: outbox.callbackUrl,
          requestBody: outbox.payloadJson as any,
          responseStatus,
          responseBody: responseBody?.substring(0, 4096) ?? null,
        },
      });

      if (res.ok) {
        await this.prisma.webhookOutbox.update({
          where: { id: outboxId },
          data: { status: 'SENT' },
        });
        this.logger.log(`Webhook delivered: ${outboxId} → ${outbox.callbackUrl}`);
        return;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Webhook delivery failed for ${outboxId}: ${errorMsg}`);

      await this.prisma.webhookLog.create({
        data: {
          outboxId,
          callbackUrl: outbox.callbackUrl,
          requestBody: outbox.payloadJson as any,
          responseStatus: null,
          responseBody: errorMsg.substring(0, 4096),
        },
      });
    }

    const newAttempts = outbox.attempts + 1;

    if (newAttempts >= WEBHOOK_MAX_RETRIES) {
      await this.prisma.webhookOutbox.update({
        where: { id: outboxId },
        data: { status: 'DLQ', attempts: newAttempts },
      });
      this.logger.error(`Webhook moved to DLQ after ${newAttempts} attempts: ${outboxId}`);
      return;
    }

    const delayIndex = Math.min(newAttempts - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1);
    const nextRetryAt = new Date(Date.now() + WEBHOOK_RETRY_DELAYS_MS[delayIndex]);

    await this.prisma.webhookOutbox.update({
      where: { id: outboxId },
      data: {
        attempts: newAttempts,
        status: 'FAILED',
        nextRetryAt,
      },
    });

    throw new Error(`Webhook delivery failed, will retry (attempt ${newAttempts}/${WEBHOOK_MAX_RETRIES})`);
  }
}

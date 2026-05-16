import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { config } from '@p2p/config';
import { PrismaService } from '../config/prisma.service';
import { decryptSecret } from '../common/utils/crypto';
import { validateCallbackUrl } from '../common/utils/url-validator';
import { readResponseBodyLimited } from '../common/utils/read-response-body-limited';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../common/utils/external-error-log';
import { WEBHOOK_MAX_RETRIES, WEBHOOK_RETRY_DELAYS_MS } from '@p2p/shared';
import { ApiKeyDirection } from '@prisma/client';
import { OpsAlertsService } from '../modules/ops-alerts/ops-alerts.service';

interface WebhookJobData {
  outboxId: string;
}

@Processor('webhook')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    try {
      await this.runJob(job);
    } catch (err) {
      this.logger.error(
        `Webhook job unexpected failure ${job.id}: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw err;
    }
  }

  private async runJob(job: Job<WebhookJobData>): Promise<void> {
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

    try {
      await validateCallbackUrl(outbox.callbackUrl);
    } catch (err) {
      this.logger.error(
        `SSRF blocked: ${outbox.callbackUrl} for outbox ${outboxId}: ${(err as Error).message}`,
      );
      await this.prisma.webhookOutbox.update({
        where: { id: outboxId },
        data: { status: 'DLQ', attempts: outbox.attempts + 1 },
      });
      void this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'Merchant webhook blocked by SSRF validation',
        lines: [
          'Callback URL rejected by SSRF validation; entry moved to DLQ.',
          `Outbox ID: ${outboxId}`,
        ],
      });
      return;
    }

    const merchant = outbox.payinOrder?.merchant ?? outbox.payoutOrder?.merchant;
    const direction: ApiKeyDirection = outbox.payinOrder ? ApiKeyDirection.PAYIN : ApiKeyDirection.PAYOUT;
    const apiKey = merchant?.apiKeys?.find((k) => k.direction === direction) ?? merchant?.apiKeys?.[0];

    let signingKey = '';
    if (apiKey?.secretKeyHash) {
      try {
        signingKey = decryptSecret(apiKey.secretKeyHash);
      } catch {
        this.logger.error(
          `Failed to decrypt signing key for outbox ${outboxId} — moving to DLQ`,
        );
        await this.prisma.webhookOutbox.update({
          where: { id: outboxId },
          data: { status: 'DLQ', attempts: outbox.attempts + 1 },
        });
        void this.opsAlerts.scheduleAlert({
          severity: 'critical',
          title: 'Webhook signing key decrypt failure',
          lines: [
            'Could not decrypt merchant signing secret; webhook moved to DLQ.',
            `Outbox ID: ${outboxId}`,
          ],
        });
        return;
      }
    }

    // Wrap data in the spec-defined envelope: { method, timestamp, data }
    const webhookBody = {
      method: outbox.method,
      timestamp: Math.floor(Date.now() / 1000),
      data: outbox.payloadJson,
    };
    const payloadStr = JSON.stringify(webhookBody);
    const signature = createHmac('sha512', signingKey)
      .update(payloadStr)
      .digest('hex');

    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutMs = config.http.webhookFetchTimeoutMs;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(outbox.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Id': outbox.id,
          },
          body: payloadStr,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      responseStatus = res.status;
      responseBody = (
        await readResponseBodyLimited(res, config.http.webhookMaxResponseBodyBytes).catch(() => '')
      ).substring(0, 4096);

      await this.prisma.webhookLog.create({
        data: {
          outboxId,
          callbackUrl: outbox.callbackUrl,
          requestBody: webhookBody as any,
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

      logHttpResponseFailure(this.logger, {
        integration: 'Merchant webhook',
        operation: 'POST callback',
        context: {
          outboxId,
          callbackOrigin: safeCallbackOrigin(outbox.callbackUrl),
        },
        status: res.status,
        statusText: res.statusText,
        bodyPreview: responseBody ?? '',
        level: 'warn',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logExternalFailure(this.logger, {
        integration: 'Merchant webhook',
        operation: 'POST callback',
        context: {
          outboxId,
          callbackOrigin: safeCallbackOrigin(outbox.callbackUrl),
        },
        error: err,
        level: 'warn',
      });

      await this.prisma.webhookLog.create({
        data: {
          outboxId,
          callbackUrl: outbox.callbackUrl,
          requestBody: webhookBody as any,
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
      const flow = outbox.payinOrder ? 'pay-in' : 'pay-out';
      void this.opsAlerts.scheduleAlert({
        severity: 'critical',
        title: 'Merchant webhook moved to DLQ',
        lines: [
          'Webhook delivery failed after all retries.',
          `Outbox ID: ${outboxId}`,
          `Callback origin: ${safeCallbackOrigin(outbox.callbackUrl)}`,
          `Flow: ${flow}`,
        ],
      });
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

function safeCallbackOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'invalid-url';
  }
}

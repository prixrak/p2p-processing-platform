import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import {
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_RETRY_DELAYS_MS,
  WebhookOutboxStatus,
} from '@p2p/shared';
import { Prisma, WebhookMethodEnum } from '@prisma/client';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook') private readonly webhookQueue: Queue,
  ) {}

  async createOutboxEntry(
    orderId: string,
    orderType: 'payin' | 'payout',
    method: WebhookMethodEnum,
    payload: Prisma.InputJsonValue,
    callbackUrl: string,
  ) {
    return this.prisma.webhookOutbox.create({
      data: {
        payinOrderId: orderType === 'payin' ? orderId : null,
        payoutOrderId: orderType === 'payout' ? orderId : null,
        method,
        payloadJson: payload,
        callbackUrl,
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });
  }

  async getOutboxPending() {
    return this.prisma.webhookOutbox.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markSent(outboxId: string) {
    return this.prisma.webhookOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'SENT',
        nextRetryAt: null,
      },
    });
  }

  async markFailed(outboxId: string, attempts: number) {
    const maxedOut = attempts >= WEBHOOK_MAX_RETRIES;
    const delayIndex = Math.min(attempts - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1);
    const delayMs = WEBHOOK_RETRY_DELAYS_MS[Math.max(0, delayIndex)];

    return this.prisma.webhookOutbox.update({
      where: { id: outboxId },
      data: {
        status: maxedOut ? 'DLQ' : 'FAILED',
        attempts,
        nextRetryAt: maxedOut ? null : new Date(Date.now() + delayMs),
      },
    });
  }

  async logAttempt(
    outboxId: string,
    callbackUrl: string,
    requestBody: Prisma.InputJsonValue,
    responseStatus: number | null,
    responseBody: string | null,
  ) {
    return this.prisma.webhookLog.create({
      data: {
        outboxId,
        callbackUrl,
        requestBody,
        responseStatus,
        responseBody,
      },
    });
  }

  async resend(outboxId: string, merchantId?: string) {
    const entry = await this.prisma.webhookOutbox.findUnique({
      where: { id: outboxId },
      include: {
        payinOrder: { select: { merchantId: true } },
        payoutOrder: { select: { merchantId: true } },
      },
    });

    if (!entry) {
      throw new NotFoundException('Webhook outbox entry not found');
    }

    if (merchantId) {
      const owner =
        entry.payinOrder?.merchantId ?? entry.payoutOrder?.merchantId;
      if (owner !== merchantId) {
        throw new ForbiddenException('This webhook does not belong to your merchant');
      }
    }

    return this.prisma.webhookOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'PENDING',
        nextRetryAt: new Date(),
      },
    });
  }

  async getLogsByMerchant(
    merchantId: string,
    filters: {
      status?: string;
      method?: string;
      from?: Date;
      to?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WebhookOutboxWhereInput = {
      OR: [
        { payinOrder: { merchantId } },
        { payoutOrder: { merchantId } },
      ],
      ...(filters.status && { status: filters.status as any }),
      ...(filters.method && { method: filters.method as any }),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lte: filters.to }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.webhookOutbox.findMany({
        where,
        include: { logs: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookOutbox.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getLogsAdmin(filters: {
    status?: string;
    method?: string;
    merchantId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const merchantFilter = filters.merchantId
      ? {
          OR: [
            { payinOrder: { merchantId: filters.merchantId } },
            { payoutOrder: { merchantId: filters.merchantId } },
          ],
        }
      : {};

    const where: Prisma.WebhookOutboxWhereInput = {
      ...merchantFilter,
      ...(filters.status && { status: filters.status as any }),
      ...(filters.method && { method: filters.method as any }),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lte: filters.to }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.webhookOutbox.findMany({
        where,
        include: {
          logs: true,
          payinOrder: { select: { merchantId: true } },
          payoutOrder: { select: { merchantId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookOutbox.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  signWebhookPayload(payload: string, secretKey: string): string {
    return createHmac('sha512', secretKey).update(payload).digest('hex');
  }

  /**
   * Enqueue a single outbox entry for immediate delivery.
   * Called after creating outbox rows so webhooks fire without waiting for the cron cycle.
   */
  async enqueueDelivery(outboxId: string): Promise<void> {
    await this.webhookQueue.add('deliver', { outboxId }, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollAndEnqueuePending(): Promise<void> {
    const pending = await this.getOutboxPending();
    if (pending.length === 0) return;

    for (const entry of pending) {
      await this.webhookQueue.add('deliver', { outboxId: entry.id }, {
        jobId: `webhook-${entry.id}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    }

    this.logger.log(`Enqueued ${pending.length} pending webhook(s) for delivery`);
  }
}

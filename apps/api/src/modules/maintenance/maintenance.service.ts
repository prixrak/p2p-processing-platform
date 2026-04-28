import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';
import { WebhookMethod } from '@p2p/shared';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    const now = new Date();

    const expiredOrders = await this.prisma.payinOrder.findMany({
      where: {
        status: { in: ['NEW', 'PENDING'] },
        autocloseAt: { lte: now },
      },
      select: { id: true, requestId: true, amount: true, callbackUrl: true, requisiteId: true },
    });

    if (expiredOrders.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payinOrder.updateMany({
        where: { id: { in: expiredOrders.map((o) => o.id) } },
        data: { status: 'CANCELED' },
      });

      const webhookEntries = expiredOrders
        .filter((o) => o.callbackUrl)
        .map((o) => ({
          payinOrderId: o.id,
          method: WebhookMethod.PAYIN_UPDATE_STATUS_ORDER as any,
          payloadJson: {
            id: o.id,
            order_id: o.requestId,
            order_status: 'CANCELED',
            amount: Number(o.amount),
          },
          callbackUrl: o.callbackUrl!,
        }));

      if (webhookEntries.length > 0) {
        for (const entry of webhookEntries) {
          await tx.webhookOutbox.create({ data: entry });
        }
      }

      // Release requisite usage for canceled orders
      for (const o of expiredOrders) {
        if (o.requisiteId) {
          await tx.requisite.update({
            where: { id: o.requisiteId },
            data: {
              usedAmount: { decrement: Number(o.amount) },
              usedOps: { decrement: 1 },
            },
          });
        }
      }
    });

    this.logger.log(`Auto-canceled ${expiredOrders.length} expired pay-in orders (${expiredOrders.filter((o) => o.callbackUrl).length} webhooks enqueued)`);
  }

  /**
   * Groups whose master switch stayed off for 7+ days move to the archive tab
   * and no longer receive new pay-in assignments.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveInactiveRequisiteGroups() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const archived = await this.prisma.requisiteGroup.updateMany({
      where: {
        isActive: false,
        archivedAt: null,
        deactivatedAt: { lte: cutoff },
      },
      data: { archivedAt: new Date() },
    });
    if (archived.count > 0) {
      this.logger.log(`Archived ${archived.count} requisite group(s) after 7d inactive`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldWebhookLogs() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deleted = await this.prisma.webhookLog.deleteMany({
      where: { sentAt: { lt: thirtyDaysAgo } },
    });

    if (deleted.count > 0) {
      this.logger.log(`Cleaned up ${deleted.count} old webhook logs`);
    }
  }
}

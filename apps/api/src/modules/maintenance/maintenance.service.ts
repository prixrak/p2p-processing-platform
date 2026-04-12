import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    const now = new Date();

    const expired = await this.prisma.payinOrder.updateMany({
      where: {
        status: { in: ['NEW', 'PENDING'] },
        autocloseAt: { lte: now },
      },
      data: { status: 'CANCELED' },
    });

    if (expired.count > 0) {
      this.logger.log(`Auto-canceled ${expired.count} expired pay-in orders`);
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

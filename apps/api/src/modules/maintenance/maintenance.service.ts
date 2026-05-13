import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

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

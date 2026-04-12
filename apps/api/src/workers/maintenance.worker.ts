import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../config/prisma.service';

@Injectable()
@Processor('maintenance')
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'check-requisite-limits':
        await this.checkRequisiteLimits();
        break;

      case 'cleanup-expired-sessions':
        await this.cleanupExpiredSessions();
        break;

      default:
        this.logger.warn(`Unknown maintenance job: ${job.name}`);
    }
  }

  private async checkRequisiteLimits(): Promise<void> {
    // Column-to-column comparison requires raw SQL (not supported by Prisma's updateMany)
    const deactivated = await this.prisma.$executeRaw`
      UPDATE requisites
      SET is_active = false
      WHERE is_active = true
        AND (
          used_amount >= limit_total_amount
          OR used_ops >= limit_total_ops
        )
    `;

    if (deactivated > 0) {
      this.logger.log(
        `Deactivated ${deactivated} requisites that exceeded their limits`,
      );
    }
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired sessions`);
    }
  }
}

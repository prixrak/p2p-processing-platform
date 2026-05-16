import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { OpsAlertSeverity } from '@p2p/config';
import { config } from '@p2p/config';
import { opsSeverityMeetsMinimum } from './ops-alert-severity';

const THROTTLE_KEY_PREFIX = 'ops-email:throttle:v1:';

export type ScheduleOpsAlertParams = {
  severity: OpsAlertSeverity;
  title: string;
  lines: string[];
  /** When set, Redis NX throttle avoids duplicate emails within TTL. */
  fingerprint?: string;
  /** Overrides default TTL derived from severity (seconds). */
  throttleSec?: number;
};

function opsEmailConfigured(): boolean {
  const { recipientEmails, smtpUser, smtpPass, fromAddress } = config.opsEmail;
  return (
    recipientEmails.length > 0 &&
    Boolean(smtpUser.trim()) &&
    Boolean(smtpPass.trim()) &&
    Boolean(fromAddress.trim())
  );
}

function defaultThrottleSec(severity: OpsAlertSeverity): number {
  const c = config.opsEmail;
  switch (severity) {
    case 'critical':
      return Math.max(60, c.throttleCriticalSec);
    case 'high':
      return Math.max(60, c.throttleHighSec);
    case 'medium':
      return Math.max(60, c.throttleMediumSec);
    default:
      return Math.max(60, c.throttleLowSec);
  }
}

@Injectable()
export class OpsAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsAlertsService.name);
  private redis: Redis | null = null;

  constructor(@InjectQueue('ops-email') private readonly opsEmailQueue: Queue) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    void this.redis.connect().catch((e) => {
      this.logger.warn(`Redis connect failed (ops email throttle disabled): ${e}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  /**
   * Enqueues a transactional ops email when SMTP and recipients are configured.
   * Applies severity floor (`OPS_EMAIL_MIN_SEVERITY`) and optional Redis throttle.
   */
  async scheduleAlert(params: ScheduleOpsAlertParams): Promise<void> {
    if (!opsEmailConfigured()) {
      return;
    }

    if (
      !opsSeverityMeetsMinimum(params.severity, config.opsEmail.minSeverity)
    ) {
      return;
    }

    const ttl =
      params.throttleSec ?? defaultThrottleSec(params.severity);

    if (params.fingerprint?.trim()) {
      const key = `${THROTTLE_KEY_PREFIX}${params.fingerprint.trim()}`;
      if (this.redis) {
        try {
          const locked = await this.redis.set(key, '1', 'EX', ttl, 'NX');
          if (locked !== 'OK') {
            return;
          }
        } catch {
          // Fail open: still enqueue so outages are not silently dropped.
        }
      }
    }

    await this.opsEmailQueue.add(
      'send',
      {
        severity: params.severity,
        title: params.title,
        lines: params.lines,
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    );

    this.logger.log({
      msg: 'ops.alert.enqueued',
      severity: params.severity,
      title: params.title,
      ...(params.fingerprint?.trim()
        ? { fingerprint: params.fingerprint.trim() }
        : {}),
    });
  }
}

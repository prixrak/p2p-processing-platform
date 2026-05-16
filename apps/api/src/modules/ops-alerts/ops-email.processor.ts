import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import type { OpsAlertSeverity } from '@p2p/config';
import { config } from '@p2p/config';

export interface OpsEmailJobData {
  severity: OpsAlertSeverity;
  title: string;
  lines: string[];
}

function opsEmailConfigured(): boolean {
  const { recipientEmails, smtpUser, smtpPass, fromAddress } = config.opsEmail;
  return (
    recipientEmails.length > 0 &&
    Boolean(smtpUser.trim()) &&
    Boolean(smtpPass.trim()) &&
    Boolean(fromAddress.trim())
  );
}

@Processor('ops-email')
export class OpsEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(OpsEmailProcessor.name);

  async process(job: Job<OpsEmailJobData>): Promise<void> {
    const { severity, title, lines } = job.data;

    if (!opsEmailConfigured()) {
      this.logger.warn({
        msg: 'ops.alert.skipped',
        reason: 'smtp_not_configured',
        severity,
      });
      return;
    }

    const subjectPrefix =
      severity === 'critical'
        ? '[CRITICAL]'
        : severity === 'high'
          ? '[HIGH]'
          : severity === 'medium'
            ? '[MEDIUM]'
            : '[LOW]';

    const transport = nodemailer.createTransport({
      host: config.opsEmail.smtpHost.trim(),
      port: config.opsEmail.smtpPort,
      secure: config.opsEmail.smtpSecure,
      auth: {
        user: config.opsEmail.smtpUser.trim(),
        pass: config.opsEmail.smtpPass,
      },
    });

    try {
      await transport.sendMail({
        from: config.opsEmail.fromAddress.trim(),
        to: config.opsEmail.recipientEmails,
        subject: `${subjectPrefix} ${title}`,
        text: lines.join('\n\n'),
      });

      this.logger.log({
        msg: 'ops.alert.sent',
        severity,
        title,
        jobId: job.id,
      });
    } catch (err) {
      this.logger.error({
        msg: 'ops.alert.failed',
        severity,
        title,
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}

import type { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { config } from '@p2p/config';
import type { OpsAlertSeverity } from '@p2p/config';
import { OpsEmailProcessor } from './ops-email.processor';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

describe('OpsEmailProcessor', () => {
  const sendMail = jest.fn().mockResolvedValue({});
  const prevOpsEmail = JSON.parse(JSON.stringify(config.opsEmail)) as typeof config.opsEmail;

  beforeEach(() => {
    sendMail.mockClear();
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as any);
    Object.assign(config.opsEmail, {
      recipientEmails: ['ops@test.dev'],
      smtpHost: 'smtp.example.test',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'user@test.dev',
      smtpPass: 'secret',
      fromAddress: 'from@test.dev',
      minSeverity: 'high',
      throttleCriticalSec: 3600,
      throttleHighSec: 1800,
      throttleMediumSec: 900,
      throttleLowSec: 600,
    });
  });

  afterEach(() => {
    Object.assign(config.opsEmail, prevOpsEmail);
  });

  it('calls sendMail with severity prefix and payload lines', async () => {
    const proc = new OpsEmailProcessor();
    await proc.process({
      id: 'job-1',
      data: {
        severity: 'high',
        title: 'Test alert',
        lines: ['First line', 'Second line'],
      },
    } as Job<{ severity: OpsAlertSeverity; title: string; lines: string[] }>);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[HIGH] Test alert',
        text: 'First line\n\nSecond line',
        to: ['ops@test.dev'],
        from: 'from@test.dev',
      }),
    );
  });

  it('skips send when SMTP is not configured', async () => {
    Object.assign(config.opsEmail, {
      recipientEmails: [],
      smtpUser: '',
      smtpPass: '',
      fromAddress: '',
    });

    const proc = new OpsEmailProcessor();
    await proc.process({
      id: 'job-2',
      data: { severity: 'critical', title: 'X', lines: ['y'] },
    } as Job<{ severity: OpsAlertSeverity; title: string; lines: string[] }>);

    expect(sendMail).not.toHaveBeenCalled();
  });
});

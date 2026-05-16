import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { OpsAlertsService } from './ops-alerts.service';

jest.mock('ioredis', () => jest.fn());

describe('OpsAlertsService', () => {
  const mockAdd = jest.fn().mockResolvedValue(undefined);
  const mockSet = jest.fn().mockResolvedValue('OK');
  const prevOpsEmail = JSON.parse(JSON.stringify(config.opsEmail)) as typeof config.opsEmail;

  beforeEach(() => {
    mockAdd.mockClear();
    mockSet.mockReset();
    mockSet.mockResolvedValue('OK');

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

    (Redis as unknown as jest.Mock).mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      set: mockSet,
    }));
  });

  afterEach(() => {
    Object.assign(config.opsEmail, prevOpsEmail);
  });

  async function createService(): Promise<OpsAlertsService> {
    const mod = await Test.createTestingModule({
      providers: [
        OpsAlertsService,
        { provide: getQueueToken('ops-email'), useValue: { add: mockAdd } },
      ],
    }).compile();
    const svc = mod.get(OpsAlertsService);
    svc.onModuleInit();
    return svc;
  }

  it('does not enqueue when severity is below OPS_EMAIL_MIN_SEVERITY', async () => {
    const svc = await createService();
    Object.assign(config.opsEmail, { minSeverity: 'critical' });

    await svc.scheduleAlert({
      severity: 'high',
      title: 'Noise',
      lines: ['should drop'],
    });

    expect(mockAdd).not.toHaveBeenCalled();

    await svc.onModuleDestroy();
  });

  it('dedupes alerts that share the same fingerprint via Redis NX', async () => {
    mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const svc = await createService();

    await svc.scheduleAlert({
      severity: 'high',
      title: 'Repeated',
      lines: ['once'],
      fingerprint: 'same-key',
    });

    await svc.scheduleAlert({
      severity: 'high',
      title: 'Repeated',
      lines: ['twice'],
      fingerprint: 'same-key',
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);

    await svc.onModuleDestroy();
  });

  it('enqueues without throttle when fingerprint is omitted', async () => {
    const svc = await createService();

    await svc.scheduleAlert({
      severity: 'critical',
      title: 'A',
      lines: ['1'],
    });
    await svc.scheduleAlert({
      severity: 'critical',
      title: 'B',
      lines: ['2'],
    });

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(2);

    await svc.onModuleDestroy();
  });
});

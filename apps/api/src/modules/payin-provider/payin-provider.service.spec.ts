import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { config } from '@p2p/config';
import { PayinProviderService } from './payin-provider.service';
import {
  PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
  PlatformSettingsService,
} from '../platform-settings/platform-settings.service';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

const mockOpsAlerts = { scheduleAlert: jest.fn() };

describe('PayinProviderService', () => {
  beforeEach(() => {
    mockOpsAlerts.scheduleAlert.mockClear();
  });
  const makePlatform = (integration: string) => ({
    findOne: jest.fn(async (key: string) => {
      if (key === PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED) {
        return { value: integration };
      }
      return { value: '' };
    }),
  });

  it('returns declined without HTTP when integration is disabled', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        PayinProviderService,
        { provide: PlatformSettingsService, useValue: makePlatform('false') },
        { provide: OpsAlertsService, useValue: mockOpsAlerts },
      ],
    }).compile();
    const svc = mod.get(PayinProviderService);
    const res = await svc.tryReserve({
      idempotencyKey: 'test-key-1',
      amount: 100,
      currencyCode: 'UAH',
    });
    expect(res).toEqual({ kind: 'declined', reason: 'integration_disabled' });
  });

  it('POSTs reserve when integration is on and parses accepted body', async () => {
    const prev = { ...config.payinProvider };
    Object.assign(config.payinProvider, {
      baseUrl: 'https://provider.example',
      apiKey: '',
      reservePath: '/reserve',
      timeoutMs: 5000,
      webhookSecret: prev.webhookSecret,
    });

    const orig = global.fetch;
    global.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ status: 'accepted', external_reference: 'ext-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const mod = await Test.createTestingModule({
      providers: [
        PayinProviderService,
        { provide: PlatformSettingsService, useValue: makePlatform('true') },
        { provide: OpsAlertsService, useValue: mockOpsAlerts },
      ],
    }).compile();
    const svc = mod.get(PayinProviderService);

    const res = await svc.tryReserve({
      idempotencyKey: 'idem-abc',
      amount: 250,
      currencyCode: 'uah',
      parserRateFiatPerUsdt: 42,
    });
    expect(res).toEqual({ kind: 'accepted', externalRef: 'ext-1' });
    expect(global.fetch).toHaveBeenCalled();

    global.fetch = orig;
    Object.assign(config.payinProvider, prev);
  });

  it('verifyWebhookSignature matches hex HMAC-SHA256 of raw body', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        PayinProviderService,
        { provide: PlatformSettingsService, useValue: makePlatform('false') },
        { provide: OpsAlertsService, useValue: mockOpsAlerts },
      ],
    }).compile();
    const svc = mod.get(PayinProviderService);
    const prev = { ...config.payinProvider };
    Object.assign(config.payinProvider, { ...prev, webhookSecret: 'whsec-test' });
    const raw = Buffer.from('{"payin_order_id":"x"}');
    const sig = createHmac('sha256', 'whsec-test').update(raw).digest('hex');
    expect(svc.verifyWebhookSignature(raw, sig)).toBe(true);
    expect(svc.verifyWebhookSignature(raw, 'deadbeef')).toBe(false);
    Object.assign(config.payinProvider, prev);
  });
});

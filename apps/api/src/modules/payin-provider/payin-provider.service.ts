import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@p2p/config';
import {
  PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
  PlatformSettingsService,
} from '../platform-settings/platform-settings.service';
import type { PayinProviderReserveInput, PayinProviderReserveResult } from './payin-provider.types';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

function safeHttpOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return 'invalid-url';
  }
}

/**
 * External Pay-In provider bridge (TZ §5–6). HTTP contract is minimal and env-driven;
 * extend when a concrete provider spec is fixed.
 */
@Injectable()
export class PayinProviderService {
  private readonly logger = new Logger(PayinProviderService.name);

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  /**
   * POST JSON to `{PAYIN_PROVIDER_BASE_URL}{PAYIN_PROVIDER_RESERVE_PATH}` when integration is enabled.
   * Expected success body (example): `{ "status": "accepted", "external_reference": "..." }`.
   */
  async tryReserve(input: PayinProviderReserveInput): Promise<PayinProviderReserveResult> {
    const integration = await this.platformSettings.findOne(
      PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED,
    );
    if (integration.value.trim().toLowerCase() !== 'true') {
      return { kind: 'declined', reason: 'integration_disabled' };
    }

    const base = config.payinProvider.baseUrl.trim();
    if (!base) {
      this.logger.log({
        msg: 'payin.provider.reserve_skipped',
        reason: 'missing_base_url',
        currency: input.currencyCode,
        amount: input.amount,
      });
      return { kind: 'declined', reason: 'missing_base_url' };
    }

    const url = `${base.replace(/\/$/, '')}${config.payinProvider.reservePath}`;
    const apiKey = config.payinProvider.apiKey.trim();
    const timeoutMs = config.payinProvider.timeoutMs;

    const body = {
      idempotency_key: input.idempotencyKey,
      amount: input.amount,
      currency: input.currencyCode.trim().toUpperCase(),
      ...(input.parserRateFiatPerUsdt !== undefined
        ? { parser_rate_fiat_per_usdt: input.parserRateFiatPerUsdt }
        : {}),
    };

    const started = Date.now();
    const correlationId = input.idempotencyKey.slice(0, 8);
    this.logger.log({
      msg: 'payin.provider.request',
      correlation_id: correlationId,
      currency: input.currencyCode,
      amount: input.amount,
    });

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'X-Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);

      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};

      this.logger.log({
        msg: 'payin.provider.response',
        correlation_id: correlationId,
        status: res.status,
        duration_ms: Date.now() - started,
      });

      if (!res.ok) {
        if (res.status >= 500) {
          void this.opsAlerts.scheduleAlert({
            severity: 'high',
            title: 'Pay-In external provider unavailable',
            lines: [
              'Reserve request failed with HTTP 5xx.',
              `Correlation prefix: ${correlationId}`,
              `Reason: http_${res.status}`,
              `Provider origin: ${safeHttpOrigin(base)}`,
            ],
            fingerprint: 'payin-provider:unavailable',
          });
          return { kind: 'unavailable', reason: `http_${res.status}` };
        }
        return { kind: 'declined', reason: `http_${res.status}` };
      }

      const statusRaw = String(obj.status ?? '').toLowerCase();
      if (statusRaw === 'accepted') {
        const externalRef = String(obj.external_reference ?? obj.external_id ?? '').trim();
        if (!externalRef) {
          return { kind: 'declined', reason: 'accepted_missing_external_reference' };
        }
        return { kind: 'accepted', externalRef };
      }

      return { kind: 'declined', reason: statusRaw || 'not_accepted' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn({
        msg: 'payin.provider.unavailable',
        correlation_id: correlationId,
        error: msg,
      });
      void this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'Pay-In external provider unavailable',
        lines: [
          'Reserve request failed due to transport error or timeout.',
          `Correlation prefix: ${correlationId}`,
          `Reason: ${msg}`,
          `Provider origin: ${safeHttpOrigin(base)}`,
        ],
        fingerprint: 'payin-provider:unavailable',
      });
      return { kind: 'unavailable', reason: msg };
    }
  }

  /**
   * Verifies `X-Payin-Provider-Signature` = hex-encoded HMAC-SHA256 of the raw body using webhook secret.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = config.payinProvider.webhookSecret.trim();
    if (!secret || !signatureHeader) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = String(signatureHeader).trim().toLowerCase();
    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

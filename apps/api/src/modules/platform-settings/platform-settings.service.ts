import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export const PLATFORM_SETTING_KEYS = [
  'payin_autoclose_minutes',
  'payin_autoclose_minutes_fork',
  'default_payin_commission_percent',
  'default_payout_commission_percent',
  'payin_min_amount',
  'payin_max_amount',
  'payout_min_amount',
  'payout_max_amount',
  /** When remaining Pay-In capacity (USDT balance + overdraft) is at or below this, trader cabinet shows low-capacity alert. */
  'trader_payin_low_capacity_alert_threshold_usdt',
  /** When false, cascade settings cannot set provider traffic percent above zero (TZ §5.5). */
  'payin_provider_integration_enabled',
] as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

/** Single source for callers that read this key (e.g. Pay-In autoclose TTL). */
export const PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES =
  'payin_autoclose_minutes' as const satisfies PlatformSettingKey;

/** Pay-In window for FORK-assigned orders (longer than typical CARD flows). */
export const PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES_FORK =
  'payin_autoclose_minutes_fork' as const satisfies PlatformSettingKey;

const DEFAULTS: Record<PlatformSettingKey, string> = {
  payin_autoclose_minutes: '5',
  payin_autoclose_minutes_fork: '10',
  default_payin_commission_percent: '0',
  default_payout_commission_percent: '0',
  payin_min_amount: '0',
  payin_max_amount: '999999999',
  payout_min_amount: '0',
  payout_max_amount: '999999999',
  trader_payin_low_capacity_alert_threshold_usdt: '200',
  payin_provider_integration_enabled: 'false',
};

/** Single-document reference for dashboards reading this threshold. */
export const PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT =
  'trader_payin_low_capacity_alert_threshold_usdt' as const satisfies PlatformSettingKey;

export const PLATFORM_SETTING_PAYIN_PROVIDER_INTEGRATION_ENABLED =
  'payin_provider_integration_enabled' as const satisfies PlatformSettingKey;

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.platformSetting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return PLATFORM_SETTING_KEYS.map((key) => ({
      key,
      value: map[key] ?? DEFAULTS[key],
    }));
  }

  async findOne(key: PlatformSettingKey) {
    if (!PLATFORM_SETTING_KEYS.includes(key)) {
      throw new NotFoundException(`Unknown setting key: ${key}`);
    }
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return { key, value: row?.value ?? DEFAULTS[key] };
  }

  async upsert(key: PlatformSettingKey, value: string, updatedBy: string) {
    if (!PLATFORM_SETTING_KEYS.includes(key)) {
      throw new NotFoundException(`Unknown setting key: ${key}`);
    }
    return this.prisma.platformSetting.upsert({
      where: { key },
      update: { value, updatedBy },
      create: { key, value, updatedBy },
    });
  }

  async upsertMany(
    entries: Array<{ key: PlatformSettingKey; value: string }>,
    updatedBy: string,
  ) {
    const results = await Promise.all(
      entries.map((e) => this.upsert(e.key, e.value, updatedBy)),
    );
    return results;
  }
}

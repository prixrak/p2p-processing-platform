import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { averageParserRateFromOffers, type BinanceP2pOfferPick } from '@p2p/shared';
import { BinanceP2pClient } from './binance-p2p.client';
import { TelegramService } from '../telegram/telegram.service';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

const REDIS_LAST_SUCCESS_KEY = 'binance:p2p:last_success_ms';
const REDIS_STALE_NOTIFY_LOCK = 'binance:p2p:stale_notify_lock';

export type CachedParserPayload = {
  rate: string;
  updatedAt: string;
  raw?: unknown;
};

@Injectable()
export class ExchangeRateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeRateService.name);
  private redis: Redis | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly binance: BinanceP2pClient,
    private readonly telegram: TelegramService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    void this.redis.connect().catch((e) => {
      this.logger.warn(`Redis connect failed (exchange rate cache disabled): ${e}`);
    });

    const ms = Math.max(1000, config.binanceP2p.pollMs);
    if (config.binanceP2p.pollEnabled) {
      void this.refreshFromBinance().catch(() => undefined);
      this.pollTimer = setInterval(() => {
        void this.refreshFromBinance().catch(() => undefined);
      }, ms);
    }
  }

  /**
   * Current cache + DB metadata for admin dashboards (Block 5 sections 2.2 and 6.4).
   */
  async getStatusForAdmin(): Promise<{
    /** Fiat per 1 USDT from the primary Redis slot (same pair as persisted exchange_rate_logs when enabled). */
    primaryPairParserFiatPerUsdt: number | null;
    cacheUpdatedAt: string | null;
    lastSuccessAt: string | null;
    lastLogId: string | null;
    stale: boolean;
    staleThresholdMinutes: number;
    rawSample: unknown;
    /** Current Redis cache `raw` field (live 3-offer sample), if available */
    cacheRawSample: unknown;
  }> {
    const rate = await this.getCachedParserFiatPerUsdt('UAH');
    let cacheUpdatedAt: string | null = null;
    let cacheRawSample: unknown = null;
    if (this.redis) {
      try {
        const raw = await this.redis.get(config.binanceP2p.primaryPairRedisKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedParserPayload;
          cacheUpdatedAt = parsed.updatedAt ?? null;
          cacheRawSample = parsed.raw ?? null;
        }
      } catch {
        /* ignore */
      }
    }
    const lastLog = await this.prisma.exchangeRateLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, rawPrices: true, rate: true },
    });
    let lastSuccessAt: string | null = null;
    if (this.redis) {
      try {
        const ms = await this.redis.get(REDIS_LAST_SUCCESS_KEY);
        if (ms) lastSuccessAt = new Date(parseInt(ms, 10)).toISOString();
      } catch {
        /* ignore */
      }
    }
    const thresholdMs = Math.max(1, config.binanceP2p.staleAlertMinutes) * 60_000;
    const lastMs = lastSuccessAt ? new Date(lastSuccessAt).getTime() : 0;
    const stale = lastMs === 0 ? false : Date.now() - lastMs > thresholdMs;
    return {
      primaryPairParserFiatPerUsdt: rate,
      cacheUpdatedAt,
      lastSuccessAt,
      lastLogId: lastLog?.id ?? null,
      stale,
      staleThresholdMinutes: config.binanceP2p.staleAlertMinutes,
      rawSample: lastLog?.rawPrices ?? null,
      cacheRawSample,
    };
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    void this.redis?.quit();
  }

  /**
   * Cached parser rate P (fiat per 1 USDT) for ISO currencies backed by a Binance P2P Redis slot.
   * UAH falls back to the latest persisted exchange_rate_logs row when Redis is empty.
   */
  async getCachedParserFiatPerUsdt(currency: string): Promise<number | null> {
    const c = currency.trim().toUpperCase();
    if (c === 'UAH') {
      const fromRedis = await this.readRedisRate(config.binanceP2p.primaryPairRedisKey);
      if (fromRedis !== null) return fromRedis;

      const last = await this.prisma.exchangeRateLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { rate: true },
      });
      return last ? Number(last.rate) : null;
    }
    if (c === 'KZT') {
      return this.readRedisRate(config.binanceP2p.secondaryPairRedisKey);
    }
    return null;
  }

  /**
   * Parser rate P (fiat per 1 USDT) for supported fiat currencies.
   * @param exchangeParserHint Optional specialist profile value; unmapped values fall back to Binance P2P.
   */
  async requireParserRateFiatPerUsdt(
    currency: string,
    exchangeParserHint?: string | null,
  ): Promise<number> {
    const hint = (exchangeParserHint ?? '').trim().toLowerCase();
    if (hint && hint !== 'binance' && hint !== 'binance_p2p') {
      this.logger.debug(
        `requireParserRateFiatPerUsdt: exchange_parser "${exchangeParserHint}" not mapped; using default Binance P2P source`,
      );
    }
    const c = currency.trim().toUpperCase();
    if (c !== 'UAH' && c !== 'KZT') {
      throw new Error('PARSER_RATE_UNSUPPORTED_FIAT');
    }
    const r = await this.getCachedParserFiatPerUsdt(c);
    if (r === null || !Number.isFinite(r) || r <= 0) {
      throw new Error('PARSER_RATE_UNAVAILABLE');
    }
    return r;
  }

  private async readRedisRate(redisKey: string): Promise<number | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(redisKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedParserPayload;
      const n = parseFloat(parsed.rate);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  async refreshFromBinance(): Promise<void> {
    await this.maybeAlertStaleParserRate();

    const primaryPayTypes = this.binance.getConfiguredPayTypes();
    const secondaryPayTypes = this.binance.getSecondaryPairPayTypes();
    let anyOk = false;

    if (
      await this.refreshFiatParser(
        'UAH',
        config.binanceP2p.primaryPairProbeVolume,
        config.binanceP2p.primaryPairRedisKey,
        primaryPayTypes,
        {
          persistLog: true,
        },
      )
    ) {
      anyOk = true;
    }

    if (
      await this.refreshFiatParser(
        'KZT',
        config.binanceP2p.secondaryPairProbeVolume,
        config.binanceP2p.secondaryPairRedisKey,
        secondaryPayTypes,
        {
          persistLog: false,
        },
      )
    ) {
      anyOk = true;
    }

    if (anyOk && this.redis) {
      try {
        await this.redis.set(REDIS_LAST_SUCCESS_KEY, String(Date.now()));
      } catch (e) {
        this.logger.warn(`Redis set last success failed: ${e}`);
      }
    }
  }

  private async refreshFiatParser(
    fiat: string,
    volumeFiat: number,
    redisKey: string,
    payTypes: string[],
    opts: { persistLog: boolean },
  ): Promise<boolean> {
    const offers = await this.binance.fetchBuyUsdtOffers(fiat, payTypes);
    const filtered = filterOffersForVolumeAndPayTypes(offers, payTypes, volumeFiat);
    filtered.sort((a, b) => a.price - b.price);
    const picked = averageParserRateFromOffers(filtered, config.binanceP2p.skipTopAds);
    if (!picked) {
      this.logger.debug(`Binance P2P: not enough rows after filter for ${fiat}`);
      return false;
    }

    const { rate, picked: used } = picked;
    const rawPrices = used.map((o) => ({
      nick: o.nickName,
      price: o.price,
      minFiat: o.minFiat,
      maxFiat: o.maxFiat,
      payTypes: o.payTypeLabels,
      fiat,
    }));

    if (opts.persistLog) {
      await this.prisma.exchangeRateLog.create({
        data: {
          rate,
          rawPrices,
          source: 'binance_p2p',
        },
      });
    }

    const payload: CachedParserPayload = {
      rate: rate.toFixed(6),
      updatedAt: new Date().toISOString(),
      raw: rawPrices,
    };

    if (this.redis) {
      try {
        await this.redis.set(redisKey, JSON.stringify(payload));
      } catch (e) {
        this.logger.warn(`Redis set parser rate failed (${fiat}): ${e}`);
      }
    }

    this.logger.debug(`Parser rate ${fiat}/USDT updated: ${payload.rate}`);
    return true;
  }

  /**
   * Warn when Binance P2P parser has not produced a rate recently (spec Block 5 section 2.2).
   * Ops Telegram/email notifies are throttled via Redis lock (10 min) when configured.
   */
  private async maybeAlertStaleParserRate(): Promise<void> {
    const thresholdMs = Math.max(1, config.binanceP2p.staleAlertMinutes) * 60_000;
    if (!this.redis) return;

    let lastMs = 0;
    try {
      const raw = await this.redis.get(REDIS_LAST_SUCCESS_KEY);
      if (raw) lastMs = parseInt(raw, 10);
    } catch {
      return;
    }

    if (lastMs === 0) return;
    if (Date.now() - lastMs <= thresholdMs) return;

    this.logger.warn(
      `Binance P2P parser rate is stale or missing (threshold ${config.binanceP2p.staleAlertMinutes}m). Last success: ${
        lastMs ? new Date(lastMs).toISOString() : 'never'
      }`,
    );

    try {
      const locked = await this.redis.set(REDIS_STALE_NOTIFY_LOCK, '1', 'EX', 600, 'NX');
      if (locked !== 'OK') return;

      const chatId = config.ownerOps.telegramChatId.trim();
      if (chatId) {
        const msg =
          `<b>Parser rate alert</b>\n` +
          `Binance P2P primary pair has no fresh success within ${config.binanceP2p.staleAlertMinutes} minutes.\n` +
          `Last OK: ${lastMs ? new Date(lastMs).toISOString() : 'never'}`;
        await this.telegram.sendNotification(chatId, msg);
      }

      await this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'Binance P2P parser rate stale',
        lines: [
          `Primary pair has no successful refresh within ${config.binanceP2p.staleAlertMinutes} minutes.`,
          `Last OK: ${lastMs ? new Date(lastMs).toISOString() : 'never'}`,
        ],
      });
    } catch (e) {
      this.logger.warn(`Stale parser ops notify failed: ${e}`);
    }
  }
}

function filterOffersForVolumeAndPayTypes(
  offers: BinanceP2pOfferPick[],
  payTypes: string[],
  probeVolumeFiat: number,
): BinanceP2pOfferPick[] {
  return offers.filter((o) => {
    if (probeVolumeFiat < o.minFiat || probeVolumeFiat > o.maxFiat) return false;
    if (payTypes.length === 0) return true;
    const labels = o.payTypeLabels.join(' ').toLowerCase();
    return payTypes.some((pt) => labels.includes(pt.toLowerCase()));
  });
}

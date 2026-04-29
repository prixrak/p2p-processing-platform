import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { averageParserRateFromOffers, type BinanceP2pOfferPick } from '@p2p/shared';
import { BinanceP2pClient } from './binance-p2p.client';
import { TelegramService } from '../telegram/telegram.service';

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
   * Current cache + DB metadata for admin dashboards (Block 5 §2.2, §6.4).
   */
  async getStatusForAdmin(): Promise<{
    parserRateUaPerUsdt: number | null;
    cacheUpdatedAt: string | null;
    lastSuccessAt: string | null;
    lastLogId: string | null;
    stale: boolean;
    staleThresholdMinutes: number;
    rawSample: unknown;
    /** Current Redis cache `raw` field (live 3-offer sample), if available */
    cacheRawSample: unknown;
  }> {
    const rate = await this.getParserRateUaPerUsdt();
    let cacheUpdatedAt: string | null = null;
    let cacheRawSample: unknown = null;
    if (this.redis) {
      try {
        const raw = await this.redis.get(config.binanceP2p.redisKey);
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
      parserRateUaPerUsdt: rate,
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
   * Returns parser rate P (UAH per 1 USDT), or null if unavailable.
   */
  async getParserRateUaPerUsdt(): Promise<number | null> {
    const fromRedis = await this.readRedisRate();
    if (fromRedis !== null) return fromRedis;

    const last = await this.prisma.exchangeRateLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { rate: true },
    });
    if (last) return Number(last.rate);
    return null;
  }

  /**
   * Same as getParserRateUaPerUsdt but throws if no rate exists (order creation).
   */
  async requireParserRateUaPerUsdt(): Promise<number> {
    const r = await this.getParserRateUaPerUsdt();
    if (r === null || !Number.isFinite(r) || r <= 0) {
      throw new Error('PARSER_RATE_UNAVAILABLE');
    }
    return r;
  }

  private async readRedisRate(): Promise<number | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(config.binanceP2p.redisKey);
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

    const payTypes = this.binance.getConfiguredPayTypes();
    const offers = await this.binance.fetchBuyUsdtOffers('UAH', payTypes, 50);
    const volume = config.binanceP2p.volumeUah;
    const filtered = filterOffersForVolumeAndPayTypes(offers, payTypes, volume);
    filtered.sort((a, b) => a.price - b.price);
    const picked = averageParserRateFromOffers(filtered, config.binanceP2p.skipTopAds);
    if (!picked) {
      this.logger.debug('Binance P2P: not enough rows after filter for parser average');
      await this.maybeAlertStaleParserRate();
      return;
    }

    const { rate, picked: used } = picked;
    const rawPrices = used.map((o) => ({
      nick: o.nickName,
      price: o.price,
      minFiat: o.minFiat,
      maxFiat: o.maxFiat,
      payTypes: o.payTypeLabels,
    }));

    await this.prisma.exchangeRateLog.create({
      data: {
        rate,
        rawPrices,
        source: 'binance_p2p',
      },
    });

    const payload: CachedParserPayload = {
      rate: rate.toFixed(6),
      updatedAt: new Date().toISOString(),
      raw: rawPrices,
    };

    if (this.redis) {
      try {
        await this.redis.set(config.binanceP2p.redisKey, JSON.stringify(payload));
        await this.redis.set(REDIS_LAST_SUCCESS_KEY, String(Date.now()));
      } catch (e) {
        this.logger.warn(`Redis set parser rate failed: ${e}`);
      }
    }

    this.logger.debug(`Parser rate UAH/USDT updated: ${payload.rate}`);
  }

  /**
   * Warn when Binance P2P parser has not produced a rate recently (spec §2.2).
   * Telegram notify is throttled via Redis lock (10 min) when OWNER_OPS_TELEGRAM_CHAT_ID is set.
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

    const chatId = config.ownerOps.telegramChatId;
    if (!chatId) return;

    try {
      const locked = await this.redis.set(REDIS_STALE_NOTIFY_LOCK, '1', 'EX', 600, 'NX');
      if (locked !== 'OK') return;

      const msg =
        `<b>Parser rate alert</b>\n` +
        `Binance P2P USDT/UAH has no fresh success within ${config.binanceP2p.staleAlertMinutes} minutes.\n` +
        `Last OK: ${lastMs ? new Date(lastMs).toISOString() : 'never'}`;

      await this.telegram.sendNotification(chatId, msg);
    } catch (e) {
      this.logger.warn(`Stale parser Telegram notify failed: ${e}`);
    }
  }
}

function filterOffersForVolumeAndPayTypes(
  offers: BinanceP2pOfferPick[],
  payTypes: string[],
  volumeUah: number,
): BinanceP2pOfferPick[] {
  return offers.filter((o) => {
    if (volumeUah < o.minFiat || volumeUah > o.maxFiat) return false;
    if (payTypes.length === 0) return true;
    const labels = o.payTypeLabels.join(' ').toLowerCase();
    return payTypes.some((pt) => labels.includes(pt.toLowerCase()));
  });
}

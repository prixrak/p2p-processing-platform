import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { BalanceTransactionType } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { config } from '@p2p/config';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT,
} from '../platform-settings/platform-settings.service';
import { CurrenciesService } from '../currencies/currencies.service';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../../common/utils/external-error-log';
import { TelegramRealtimeService } from './telegram-realtime.service';

type ConnectTokenEntry = {
  traderId?: string;
  payoutTraderId?: string;
};

const HANDBOOK_ALERT_THROTTLE_SEC = 8 * 3600;
const CONNECT_TOKEN_TTL_SEC = 10 * 60;
const CONNECT_TOKEN_KEY_PREFIX = 'p2p:tg:connect:';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly apiBase = 'https://api.telegram.org';

  /** Short-lived connect tokens for traders or Pay-Out specialists (Redis; in-memory fallback). */
  private connectRedis: Redis | null = null;
  private connectRedisInitAttempted = false;
  private readonly memConnectTokens = new Map<
    string,
    ConnectTokenEntry & { expiresAt: number }
  >();

  /** Dedup low-capacity / exhausted alerts (Redis preferred; in-memory fallback for dev / Redis outage). */
  private redis: Redis | null = null;
  private redisInitAttempted = false;
  private readonly memThrottleUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly currencies: CurrenciesService,
    private readonly telegramRealtime: TelegramRealtimeService,
  ) {
    this.botToken = config.telegram.botToken;
  }

  async sendNotification(chatId: string, message: string): Promise<boolean> {
    const url = `${this.apiBase}/bot${this.botToken}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logHttpResponseFailure(this.logger, {
          integration: 'Telegram Bot API',
          operation: 'sendMessage',
          context: { chatId },
          status: res.status,
          statusText: res.statusText,
          bodyPreview: body,
          level: 'warn',
        });

        if (res.status === 403 || res.status === 400) {
          await this.deactivateSettings(chatId);
        }

        return false;
      }

      return true;
    } catch (err) {
      logExternalFailure(this.logger, {
        integration: 'Telegram Bot API',
        operation: 'sendMessage',
        context: { chatId },
        error: err,
      });
      return false;
    }
  }

  async getSettings(traderId: string) {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { traderId },
    });

    const row =
      settings ??
      (await this.prisma.telegramSettings.create({
        data: { traderId },
      }));

    return this.withBotUsername(row);
  }

  async updateSettings(
    traderId: string,
    dto: {
      notifyPayin?: boolean;
      notifyPayout?: boolean;
      notifyAppeals?: boolean;
      notifyLowPayinCapacity?: boolean;
      notifyTopUpConfirm?: boolean;
      notifyPayinCapacityExhausted?: boolean;
      isActive?: boolean;
    },
  ) {
    const row = await this.prisma.telegramSettings.upsert({
      where: { traderId },
      update: dto,
      create: {
        traderId,
        ...dto,
      },
    });
    return this.withBotUsername(row);
  }

  async getPayoutTraderSettings(payoutTraderId: string) {
    const settings = await this.prisma.payoutTraderTelegramSettings.findUnique({
      where: { payoutTraderId },
    });

    const row =
      settings ??
      (await this.prisma.payoutTraderTelegramSettings.create({
        data: { payoutTraderId },
      }));

    return this.withBotUsername(row);
  }

  async updatePayoutTraderSettings(
    payoutTraderId: string,
    dto: {
      notifyNewPoolOrder?: boolean;
      notifySettlement?: boolean;
      isActive?: boolean;
    },
  ) {
    const row = await this.prisma.payoutTraderTelegramSettings.upsert({
      where: { payoutTraderId },
      update: dto,
      create: {
        payoutTraderId,
        ...dto,
      },
    });
    return this.withBotUsername(row);
  }

  getPublicBotUsername(): string | null {
    const username = config.telegram.botUsername.trim();
    return username || null;
  }

  createConnectResponse(token: string) {
    return {
      token,
      botUsername: this.getPublicBotUsername(),
    };
  }

  private withBotUsername<T extends object>(row: T) {
    return {
      ...row,
      botUsername: this.getPublicBotUsername(),
    };
  }

  async generateConnectToken(traderId: string): Promise<string> {
    return this.storeConnectToken({ traderId });
  }

  async generatePayoutTraderConnectToken(payoutTraderId: string): Promise<string> {
    return this.storeConnectToken({ payoutTraderId });
  }

  private getConnectRedis(): Redis | null {
    if (this.connectRedisInitAttempted) return this.connectRedis;
    this.connectRedisInitAttempted = true;
    try {
      const r = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.connectRedis = r;
    } catch {
      this.connectRedis = null;
    }
    return this.connectRedis;
  }

  private async storeConnectToken(entry: ConnectTokenEntry): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const payload = JSON.stringify(entry);
    const r = this.getConnectRedis();
    if (r) {
      try {
        await r.set(
          `${CONNECT_TOKEN_KEY_PREFIX}${token}`,
          payload,
          'EX',
          CONNECT_TOKEN_TTL_SEC,
        );
        return token;
      } catch {
        // fall through to memory
      }
    }

    this.memConnectTokens.set(token, {
      ...entry,
      expiresAt: Date.now() + CONNECT_TOKEN_TTL_SEC * 1000,
    });
    this.pruneMemConnectTokens();
    return token;
  }

  private pruneMemConnectTokens(): void {
    const now = Date.now();
    for (const [key, val] of this.memConnectTokens) {
      if (val.expiresAt < now) {
        this.memConnectTokens.delete(key);
      }
    }
  }

  private async consumeConnectToken(
    token: string,
  ): Promise<ConnectTokenEntry | null> {
    const r = this.getConnectRedis();
    if (r) {
      try {
        const key = `${CONNECT_TOKEN_KEY_PREFIX}${token}`;
        const raw = await r.get(key);
        if (!raw) return null;
        await r.del(key);
        return JSON.parse(raw) as ConnectTokenEntry;
      } catch {
        // fall through to memory
      }
    }

    const entry = this.memConnectTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      this.memConnectTokens.delete(token);
      return null;
    }
    this.memConnectTokens.delete(token);
    const { expiresAt: _expiresAt, ...rest } = entry;
    return rest;
  }

  async handleBotConnect(token: string, chatId: string) {
    const entry = await this.consumeConnectToken(token);

    if (!entry) {
      throw new BadRequestException('Invalid or expired connect token');
    }

    if (entry.traderId) {
      const settings = await this.prisma.telegramSettings.upsert({
        where: { traderId: entry.traderId },
        update: { chatId, isActive: true },
        create: {
          traderId: entry.traderId,
          chatId,
          isActive: true,
        },
      });

      this.logger.log(
        `Telegram linked for trader ${entry.traderId}, chatId ${chatId}`,
      );

      void this.telegramRealtime.publishTraderLinked(entry.traderId, {
        chatId,
        isActive: true,
      });

      return settings;
    }

    if (entry.payoutTraderId) {
      const settings = await this.prisma.payoutTraderTelegramSettings.upsert({
        where: { payoutTraderId: entry.payoutTraderId },
        update: { chatId, isActive: true },
        create: {
          payoutTraderId: entry.payoutTraderId,
          chatId,
          isActive: true,
        },
      });

      this.logger.log(
        `Telegram linked for Pay-Out specialist ${entry.payoutTraderId}, chatId ${chatId}`,
      );

      void this.telegramRealtime.publishPayoutTraderLinked(entry.payoutTraderId, {
        chatId,
        isActive: true,
      });

      return settings;
    }

    throw new BadRequestException('Invalid connect token payload');
  }

  async notifyNewPayin(
    traderId: string,
    orderInfo: { id: string; amount: number; currency: string },
  ): Promise<boolean> {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { traderId },
    });

    if (!settings?.isActive || !settings.notifyPayin || !settings.chatId) {
      return false;
    }

    const message =
      `<b>New Pay-In Order</b>\n` +
      `Order: <code>${orderInfo.id}</code>\n` +
      `Amount: ${orderInfo.amount} ${orderInfo.currency}`;

    return this.sendNotification(settings.chatId, message);
  }

  async notifyNewPayout(
    traderId: string,
    orderInfo: { id: string; amount: number; currency: string },
  ): Promise<boolean> {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { traderId },
    });

    if (!settings?.isActive || !settings.notifyPayout || !settings.chatId) {
      return false;
    }

    const message =
      `<b>New Pay-Out Order</b>\n` +
      `Order: <code>${orderInfo.id}</code>\n` +
      `Amount: ${orderInfo.amount} ${orderInfo.currency}`;

    return this.sendNotification(settings.chatId, message);
  }

  async notifyAppeal(
    traderId: string,
    appealInfo: { id: string; orderId: string; paidAmount: number },
  ): Promise<boolean> {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { traderId },
    });

    if (!settings?.isActive || !settings.notifyAppeals || !settings.chatId) {
      return false;
    }

    const message =
      `<b>Appeal Opened</b>\n` +
      `Appeal: <code>${appealInfo.id}</code>\n` +
      `Order: <code>${appealInfo.orderId}</code>\n` +
      `Paid amount: ${appealInfo.paidAmount}`;

    return this.sendNotification(settings.chatId, message);
  }

  /** Notify all active Pay-Out specialists in the order fiat currency geo. */
  async notifyPayoutSpecialistsNewPoolOrder(
    orderCurrency: string,
    orderInfo: { id: string; amount: number; currency: string },
  ): Promise<void> {
    const specialists = await this.prisma.payoutTraderProfile.findMany({
      where: {
        isActive: true,
        country: { currency: { code: orderCurrency.trim().toUpperCase() } },
      },
      include: {
        telegramSettings: true,
      },
    });

    const message =
      `<b>New Pay-Out (specialist pool)</b>\n` +
      `Order: <code>${orderInfo.id}</code>\n` +
      `Amount: ${orderInfo.amount} ${orderInfo.currency}`;

    for (const s of specialists) {
      const ts = s.telegramSettings;
      if (!ts?.isActive || !ts.notifyNewPoolOrder || !ts.chatId) {
        continue;
      }
      void this.sendNotification(ts.chatId, message);
    }
  }

  /**
   * Settlements handbook — section 1.3: after trader USDT ledger rows, optionally push capacity / top-up alerts.
   * Deferred briefly so callers inside Prisma `$transaction` read post-commit balances.
   */
  scheduleTraderSettlementHandbookAlerts(payload: {
    traderId: string;
    balanceTxType: BalanceTransactionType;
    topUpAmountUsdt?: number;
  }): void {
    setTimeout(() => {
      void this.deliverTraderSettlementHandbookAlerts(payload).catch((err) => {
        this.logger.warn(
          `Trader settlement handbook Telegram alerts failed: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
    }, 160);
  }

  private getHandbookThrottleRedis(): Redis | null {
    if (this.redisInitAttempted) return this.redis;
    this.redisInitAttempted = true;
    try {
      const r = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.redis = r;
    } catch {
      this.redis = null;
    }
    return this.redis;
  }

  private async acquireHandbookThrottleKey(key: string): Promise<boolean> {
    const r = this.getHandbookThrottleRedis();
    if (r) {
      try {
        const ok = await r.set(
          `p2p:tg:handbook:${key}`,
          '1',
          'EX',
          HANDBOOK_ALERT_THROTTLE_SEC,
          'NX',
        );
        return ok === 'OK';
      } catch {
        // fall through to memory
      }
    }
    const now = Date.now();
    const until = this.memThrottleUntil.get(key) ?? 0;
    if (now < until) return false;
    this.memThrottleUntil.set(key, now + HANDBOOK_ALERT_THROTTLE_SEC * 1000);
    return true;
  }

  private async clearHandbookThrottleKeys(traderId: string): Promise<void> {
    const low = `low:${traderId}`;
    const ex = `exhausted:${traderId}`;
    const r = this.getHandbookThrottleRedis();
    if (r) {
      try {
        await r.del(`p2p:tg:handbook:${low}`, `p2p:tg:handbook:${ex}`);
      } catch {
        // ignore
      }
    }
    this.memThrottleUntil.delete(low);
    this.memThrottleUntil.delete(ex);
  }

  private async deliverTraderSettlementHandbookAlerts(payload: {
    traderId: string;
    balanceTxType: BalanceTransactionType;
    topUpAmountUsdt?: number;
  }): Promise<void> {
    const usdtId = await this.currencies.getUsdtCurrencyId();
    const [profile, balRow, tg, thresholdRow] = await Promise.all([
      this.prisma.traderProfile.findUnique({
        where: { id: payload.traderId },
        select: {
          id: true,
          overdraftLimit: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.traderBalance.findUnique({
        where: {
          traderId_currencyId: { traderId: payload.traderId, currencyId: usdtId },
        },
        select: { amount: true },
      }),
      this.prisma.telegramSettings.findUnique({ where: { traderId: payload.traderId } }),
      this.platformSettings.findOne(PLATFORM_SETTING_TRADER_PAYIN_LOW_CAPACITY_ALERT_THRESHOLD_USDT),
    ]);

    if (!profile) return;

    const chatId = tg?.chatId;
    const active = tg?.isActive && chatId;

    if (
      payload.balanceTxType === BalanceTransactionType.TOP_UP &&
      tg?.notifyTopUpConfirm &&
      active &&
      payload.topUpAmountUsdt !== undefined
    ) {
      const msg =
        `<b>Balance top-up recorded</b>\n` +
        `Amount: ${payload.topUpAmountUsdt} USDT\n` +
        `Account: <code>${profile.user.email}</code>`;
      await this.sendNotification(chatId!, msg);
    }

    if (!active) return;

    const balanceUsdt = Number(balRow?.amount ?? 0);
    const overdraftLimit = Number(profile.overdraftLimit ?? 0);
    const availableForPayin = balanceUsdt + overdraftLimit;

    const parsedThr = Number(thresholdRow.value);
    const thresholdUsdt =
      Number.isFinite(parsedThr) && parsedThr >= 0 ? parsedThr : 200;

    if (availableForPayin > thresholdUsdt + 1e-9) {
      await this.clearHandbookThrottleKeys(payload.traderId);
      return;
    }

    if (
      availableForPayin <= 0 + 1e-9 &&
      tg.notifyPayinCapacityExhausted &&
      (await this.acquireHandbookThrottleKey(`exhausted:${payload.traderId}`))
    ) {
      const traderMsg =
        `<b>Pay-In capacity exhausted</b>\n` +
        `No remaining USDT headroom for Pay-In (balance + overdraft used). Top up in the cabinet to resume.`;
      await this.sendNotification(chatId, traderMsg);

      const opsId = config.ownerOps.telegramChatId?.trim();
      if (opsId) {
        const opsMsg =
          `<b>Trader Pay-In capacity exhausted</b>\n` +
          `Trader: <code>${profile.user.email}</code>\n` +
          `ID: <code>${profile.id}</code>\n` +
          `Remaining capacity: ${availableForPayin.toFixed(4)} USDT`;
        await this.sendNotification(opsId, opsMsg);
      }
      return;
    }

    if (
      availableForPayin <= thresholdUsdt + 1e-9 &&
      tg.notifyLowPayinCapacity &&
      (await this.acquireHandbookThrottleKey(`low:${payload.traderId}`))
    ) {
      const msg =
        `<b>Low Pay-In capacity</b>\n` +
        `Remaining (balance + overdraft): ${availableForPayin.toFixed(4)} USDT\n` +
        `Alert threshold: ${thresholdUsdt} USDT\n` +
        `Top up via the cabinet deposit instructions.`;
      await this.sendNotification(chatId, msg);
    }
  }

  async notifyPayoutSpecialistSettlement(
    payoutTraderId: string,
    info: { settlementId: string; amount: number; type: string },
  ): Promise<boolean> {
    const settings = await this.prisma.payoutTraderTelegramSettings.findUnique({
      where: { payoutTraderId },
    });

    if (!settings?.isActive || !settings.notifySettlement || !settings.chatId) {
      return false;
    }

    const message =
      `<b>Settlement recorded</b>\n` +
      `ID: <code>${info.settlementId}</code>\n` +
      `Type: ${info.type}\n` +
      `Amount: ${info.amount} USDT`;

    return this.sendNotification(settings.chatId, message);
  }

  private async deactivateSettings(chatId: string) {
    try {
      await this.prisma.telegramSettings.updateMany({
        where: { chatId },
        data: { isActive: false },
      });
      await this.prisma.payoutTraderTelegramSettings.updateMany({
        where: { chatId },
        data: { isActive: false },
      });
      this.logger.warn(`Deactivated telegram settings for chatId ${chatId}`);
    } catch {
      // Best-effort deactivation
    }
  }
}

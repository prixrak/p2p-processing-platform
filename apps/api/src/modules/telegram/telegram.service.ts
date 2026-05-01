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

type ConnectTokenEntry = {
  traderId?: string;
  payoutTraderId?: string;
  expiresAt: number;
};

const HANDBOOK_ALERT_THROTTLE_SEC = 8 * 3600;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly apiBase = 'https://api.telegram.org';

  /** Short-lived connect tokens for traders or Pay-Out specialists. */
  private readonly connectTokens = new Map<string, ConnectTokenEntry>();

  /** Dedup low-capacity / exhausted alerts (Redis preferred; in-memory fallback for dev / Redis outage). */
  private redis: Redis | null = null;
  private redisInitAttempted = false;
  private readonly memThrottleUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly currencies: CurrenciesService,
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

    if (!settings) {
      return this.prisma.telegramSettings.create({
        data: { traderId },
      });
    }

    return settings;
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
    return this.prisma.telegramSettings.upsert({
      where: { traderId },
      update: dto,
      create: {
        traderId,
        ...dto,
      },
    });
  }

  async getPayoutTraderSettings(payoutTraderId: string) {
    const settings = await this.prisma.payoutTraderTelegramSettings.findUnique({
      where: { payoutTraderId },
    });

    if (!settings) {
      return this.prisma.payoutTraderTelegramSettings.create({
        data: { payoutTraderId },
      });
    }

    return settings;
  }

  async updatePayoutTraderSettings(
    payoutTraderId: string,
    dto: {
      notifyNewPoolOrder?: boolean;
      notifySettlement?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.payoutTraderTelegramSettings.upsert({
      where: { payoutTraderId },
      update: dto,
      create: {
        payoutTraderId,
        ...dto,
      },
    });
  }

  generateConnectToken(traderId: string): string {
    return this.storeConnectToken({ traderId });
  }

  generatePayoutTraderConnectToken(payoutTraderId: string): string {
    return this.storeConnectToken({ payoutTraderId });
  }

  private storeConnectToken(entry: Omit<ConnectTokenEntry, 'expiresAt'>): string {
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;

    this.connectTokens.set(token, { ...entry, expiresAt });

    for (const [key, val] of this.connectTokens) {
      if (val.expiresAt < Date.now()) {
        this.connectTokens.delete(key);
      }
    }

    return token;
  }

  async handleBotConnect(token: string, chatId: string) {
    const entry = this.connectTokens.get(token);

    if (!entry) {
      throw new BadRequestException('Invalid or expired connect token');
    }

    if (entry.expiresAt < Date.now()) {
      this.connectTokens.delete(token);
      throw new BadRequestException('Connect token has expired');
    }

    this.connectTokens.delete(token);

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
      });
      void r.connect().catch(() => undefined);
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

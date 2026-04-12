import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { config } from '@p2p/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly apiBase = 'https://api.telegram.org';

  /** In-memory store for short-lived connect tokens: token -> { traderId, expiresAt } */
  private readonly connectTokens = new Map<
    string,
    { traderId: string; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {
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
        this.logger.warn(
          `Telegram API error for chat ${chatId}: ${res.status} ${body}`,
        );

        if (res.status === 403 || res.status === 400) {
          await this.deactivateSettings(chatId);
        }

        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(
        `Telegram send failed for chat ${chatId}: ${err instanceof Error ? err.message : err}`,
      );
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

  generateConnectToken(traderId: string): string {
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    this.connectTokens.set(token, { traderId, expiresAt });

    // Clean up expired tokens periodically
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

  private async deactivateSettings(chatId: string) {
    try {
      await this.prisma.telegramSettings.updateMany({
        where: { chatId },
        data: { isActive: false },
      });
      this.logger.warn(`Deactivated telegram settings for chatId ${chatId}`);
    } catch {
      // Best-effort deactivation
    }
  }
}

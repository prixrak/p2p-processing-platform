import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BlockchainNetwork } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { TrongridClient } from './trongrid.client';
import { WalletDepositsService } from './wallet-deposits.service';
import { TelegramService } from '../telegram/telegram.service';

/**
 * Polls TronGrid for USDT TRC-20 transfers to per-trader deposit addresses (Block 5 §10.2–10.5).
 * Intended to run in the worker process only.
 *
 * Ethereum ERC-20 USDT monitoring runs in the ERC-20 deposit worker when ETH_RPC_URL is set.
 */
@Injectable()
export class TronDepositPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TronDepositPollerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trongrid: TrongridClient,
    private readonly walletDeposits: WalletDepositsService,
    private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    if (!config.tron.depositPollEnabled) {
      this.logger.log('Tron deposit poller disabled (TRON_DEPOSIT_POLL_ENABLED=false)');
      return;
    }
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    void this.redis.connect().catch((e) => {
      this.logger.warn(`Tron poller Redis connect failed (head block cache / alerts disabled): ${e}`);
    });

    const ms =
      config.tron.depositPollMode === 'contract_events'
        ? Math.max(5000, config.tron.contractEventsPollSec * 1000)
        : Math.max(5000, config.tron.depositPollMs);
    void this.poll().catch((e) => this.logger.error(e));
    this.timer = setInterval(() => {
      void this.poll().catch((e) => this.logger.error(e));
    }, ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    void this.redis?.quit();
  }

  private async touchPollSuccess(headBlock: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(config.tron.lastSuccessRedisKey, String(Date.now()));
      await this.redis.set(config.tron.lastHeadBlockRedisKey, String(headBlock));
    } catch (e) {
      this.logger.warn(`Tron poller Redis write failed: ${e}`);
    }
  }

  /**
   * Block 5 §10.5 — alert owner if TronGrid polling has not succeeded recently.
   */
  private async maybeAlertStaleTron(): Promise<void> {
    const thresholdMs = Math.max(1, config.tron.staleAlertMinutes) * 60_000;
    if (!this.redis) return;

    let lastMs = 0;
    try {
      const raw = await this.redis.get(config.tron.lastSuccessRedisKey);
      if (raw) lastMs = parseInt(raw, 10);
    } catch {
      return;
    }

    if (lastMs === 0) return;
    if (Date.now() - lastMs <= thresholdMs) return;

    this.logger.warn(
      `Tron deposit poller stale (threshold ${config.tron.staleAlertMinutes}m). Last OK: ${new Date(lastMs).toISOString()}`,
    );

    const chatId = config.ownerOps.telegramChatId;
    if (!chatId) return;

    try {
      const locked = await this.redis.set(
        config.tron.staleNotifyLockRedisKey,
        '1',
        'EX',
        600,
        'NX',
      );
      if (locked !== 'OK') return;

      const msg =
        `<b>TronGrid deposit poller alert</b>\n` +
        `No successful poll within ${config.tron.staleAlertMinutes} minutes.\n` +
        `Last OK: ${new Date(lastMs).toISOString()}`;

      await this.telegram.sendNotification(chatId, msg);
    } catch (e) {
      this.logger.warn(`Tron stale Telegram notify failed: ${e}`);
    }
  }

  async poll(): Promise<void> {
    await this.maybeAlertStaleTron();

    if (config.tron.depositPollMode === 'contract_events') {
      await this.pollViaContractEvents();
      return;
    }

    await this.pollPerAccount();
  }

  private async buildTronDepositAddressIndex(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const custodial = await this.prisma.traderWallet.findMany({
      where: { isActive: true },
      select: { traderId: true, address: true },
    });
    for (const w of custodial) {
      map.set(w.address, w.traderId);
    }
    const legacy = await this.prisma.traderProfile.findMany({
      where: { isActive: true, usdtTrc20DepositAddress: { not: null } },
      select: { id: true, usdtTrc20DepositAddress: true },
    });
    for (const t of legacy) {
      const a = t.usdtTrc20DepositAddress!;
      if (!map.has(a)) map.set(a, t.id);
    }
    return map;
  }

  private parseTrc20ValueSun(raw: string): number {
    try {
      const n = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
      return Number(n) / 1e6;
    } catch {
      return NaN;
    }
  }

  private async pollViaContractEvents(): Promise<void> {
    const addrIndex = await this.buildTronDepositAddressIndex();
    if (addrIndex.size === 0) return;

    const currentBlock = await this.trongrid.getNowBlockNumber();
    if (currentBlock === null) {
      this.logger.warn('Tron: could not read current block; skipping contract events poll');
      return;
    }

    const minConf = Math.max(1, config.tron.minConfirmations);
    const minAmt = config.tron.minAmountUsdt;

    const events = await this.trongrid.collectUsdtTransferEvents(config.tron.contractEventsMaxPages);
    for (const ev of events) {
      const traderId = addrIndex.get(ev.to_base58);
      if (!traderId) continue;
      if (ev.from_base58 === ev.to_base58) continue;

      const amountUsdt = this.parseTrc20ValueSun(ev.value_raw);
      if (!Number.isFinite(amountUsdt) || amountUsdt < minAmt) continue;

      const confirmations = currentBlock - ev.block_number + 1;
      if (confirmations < 1) continue;

      const result = await this.walletDeposits.observeAndMaybeCredit(
        traderId,
        ev.transaction_id,
        amountUsdt,
        confirmations,
        minConf,
        null,
        BlockchainNetwork.TRC20,
        { toAddress: ev.to_base58, blockNumber: ev.block_number },
      );
      if (result.status === 'credited') {
        this.logger.log(
          `Tron TOP_UP (contract events) trader=${traderId} tx=${ev.transaction_id} amount=${amountUsdt}`,
        );
      }
    }

    await this.touchPollSuccess(currentBlock);
  }

  private async pollPerAccount(): Promise<void> {
    const traders = await this.prisma.traderProfile.findMany({
      where: {
        usdtTrc20DepositAddress: { not: null },
        isActive: true,
      },
      select: { id: true, usdtTrc20DepositAddress: true },
    });

    if (traders.length === 0) return;

    const currentBlock = await this.trongrid.getNowBlockNumber();
    if (currentBlock === null) {
      this.logger.warn('Tron: could not read current block; skipping poll');
      return;
    }

    const minConf = Math.max(1, config.tron.minConfirmations);
    const minAmt = config.tron.minAmountUsdt;
    const blockCache = new Map<string, number | null>();

    for (const t of traders) {
      const addr = t.usdtTrc20DepositAddress!;
      const rows = await this.trongrid.listRecentUsdtTrc20(addr);
      for (const row of rows) {
        const txId = row.transaction_id;
        const to = row.to ?? '';
        const from = row.from ?? '';
        if (!txId || to !== addr) continue;
        if (from === addr) continue;

        const raw = row.value ?? '0';
        const amountUsdt = Number(raw) / 1e6;
        if (!Number.isFinite(amountUsdt) || amountUsdt < minAmt) continue;

        let txBlock = blockCache.get(txId);
        if (txBlock === undefined) {
          txBlock = await this.trongrid.getTxBlockNumber(txId);
          blockCache.set(txId, txBlock);
        }
        if (txBlock === null) continue;

        const confirmations = currentBlock - txBlock + 1;
        if (confirmations < 1) continue;

        const result = await this.walletDeposits.observeAndMaybeCredit(
          t.id,
          txId,
          amountUsdt,
          confirmations,
          minConf,
          null,
          BlockchainNetwork.TRC20,
          { toAddress: addr, blockNumber: txBlock },
        );
        if (result.status === 'credited') {
          this.logger.log(`Tron TOP_UP trader=${t.id} tx=${txId} amount=${amountUsdt}`);
        }
      }
    }

    await this.touchPollSuccess(currentBlock);
  }
}

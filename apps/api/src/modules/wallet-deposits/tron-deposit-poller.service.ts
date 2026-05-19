import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BlockchainNetwork } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { TrongridClient } from './trongrid.client';
import { WalletDepositsService } from './wallet-deposits.service';
import { TelegramService } from '../telegram/telegram.service';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

/** TRC-20 USDT on Tron mainnet (Nile tests must use the testnet mint in env instead). */
const TRON_MAINNET_USDT_CONTRACT_BASE58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

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
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  onModuleInit(): void {
    if (!config.tron.depositPollEnabled) {
      this.logger.log('Tron deposit poller disabled (TRON_DEPOSIT_POLL_ENABLED=false)');
      return;
    }
    this.warnIfNileUsesMainnetUsdtContract();
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

  /**
   * Nile uses a different USDT mint than mainnet; wrong `TRON_USDT_TRC20_CONTRACT` yields empty
   * TronGrid pages, so no TOP_UP / settlement rows are ever created.
   */
  private warnIfNileUsesMainnetUsdtContract(): void {
    try {
      const host = new URL(config.tron.baseUrl.trim()).hostname.toLowerCase();
      if (host !== 'nile.trongrid.io') return;
      const c = config.tron.usdtTrc20Contract.trim();
      if (c === TRON_MAINNET_USDT_CONTRACT_BASE58) {
        this.logger.warn(
          'Tron deposit poller: TRONGRID_BASE_URL points to Nile but TRON_USDT_TRC20_CONTRACT is mainnet USDT. ' +
            'TronGrid will return no TRC-20 rows for this filter — set TRON_USDT_TRC20_CONTRACT to the Nile testnet USDT contract.',
        );
      }
    } catch {
      // invalid TRONGRID_BASE_URL
    }
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

    try {
      const locked = await this.redis.set(
        config.tron.staleNotifyLockRedisKey,
        '1',
        'EX',
        600,
        'NX',
      );
      if (locked !== 'OK') return;

      const chatId = config.ownerOps.telegramChatId.trim();
      if (chatId) {
        const msg =
          `<b>TronGrid deposit poller alert</b>\n` +
          `No successful poll within ${config.tron.staleAlertMinutes} minutes.\n` +
          `Last OK: ${new Date(lastMs).toISOString()}`;
        await this.telegram.sendNotification(chatId, msg);
      }

      await this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'TronGrid deposit poller stale',
        lines: [
          `No successful poll within ${config.tron.staleAlertMinutes} minutes.`,
          `Last OK: ${new Date(lastMs).toISOString()}`,
        ],
      });
    } catch (e) {
      this.logger.warn(`Tron stale ops notify failed: ${e}`);
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
      const a = w.address.trim();
      if (a) map.set(a, w.traderId);
    }
    const profileInlineTrc20 = await this.prisma.traderProfile.findMany({
      where: {
        isActive: true,
        usdtTrc20DepositAddress: { not: null },
        NOT: { usdtTrc20DepositAddress: '' },
      },
      select: { id: true, usdtTrc20DepositAddress: true },
    });
    for (const t of profileInlineTrc20) {
      const a = t.usdtTrc20DepositAddress!.trim();
      if (!a || map.has(a)) continue;
      map.set(a, t.id);
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
    const addrIndex = await this.buildTronDepositAddressIndex();
    if (addrIndex.size === 0) return;

    const currentBlock = await this.trongrid.getNowBlockNumber();
    if (currentBlock === null) {
      this.logger.warn('Tron: could not read current block; skipping poll');
      return;
    }

    for (const [addr, traderId] of addrIndex) {
      const { credited } = await this.walletDeposits.reconcileTrc20IncomingForAddress(
        traderId,
        addr,
      );
      if (credited > 0) {
        this.logger.log(
          `Tron TOP_UP trader=${traderId} address=${addr} credited_count=${credited}`,
        );
      }
    }

    await this.touchPollSuccess(currentBlock);
  }
}

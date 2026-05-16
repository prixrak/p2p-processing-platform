import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BlockchainNetwork } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import {
  EthereumJsonRpcClient,
  ERC20_TRANSFER_TOPIC,
  decodeUint256Data,
  padTopicAddress,
} from './ethereum-json-rpc.client';
import { WalletDepositsService } from './wallet-deposits.service';
import { TelegramService } from '../telegram/telegram.service';
import { OpsAlertsService } from '../ops-alerts/ops-alerts.service';

/**
 * Polls Ethereum mainnet USDT (ERC-20) transfers to per-trader deposit addresses (Block 5 §10.2–10.5).
 * Requires ETH_RPC_URL (Infura / Alchemy). Intended for the worker process only.
 */
@Injectable()
export class Erc20DepositPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Erc20DepositPollerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eth: EthereumJsonRpcClient,
    private readonly walletDeposits: WalletDepositsService,
    private readonly telegram: TelegramService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  onModuleInit(): void {
    if (!config.ethereum.depositPollEnabled) {
      this.logger.log('ERC-20 deposit poller disabled (ETH_DEPOSIT_POLL_ENABLED=false)');
      return;
    }
    if (!config.ethereum.rpcUrl.trim()) {
      this.logger.warn('ERC-20 deposit poller enabled but ETH_RPC_URL is empty — worker will skip polls');
      return;
    }

    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    void this.redis.connect().catch((e) => {
      this.logger.warn(`ERC-20 poller Redis connect failed: ${e}`);
    });

    const ms = Math.max(5000, config.ethereum.depositPollMs);
    void this.poll().catch((e) => this.logger.error(e));
    this.timer = setInterval(() => {
      void this.poll().catch((e) => this.logger.error(e));
    }, ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    void this.redis?.quit();
  }

  private async touchPollSuccess(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(config.ethereum.lastSuccessRedisKey, String(Date.now()));
    } catch (e) {
      this.logger.warn(`ERC-20 poller Redis touch failed: ${e}`);
    }
  }

  private async maybeAlertStaleEth(): Promise<void> {
    const thresholdMs = Math.max(1, config.ethereum.staleAlertMinutes) * 60_000;
    if (!this.redis) return;

    let lastMs = 0;
    try {
      const raw = await this.redis.get(config.ethereum.lastSuccessRedisKey);
      if (raw) lastMs = parseInt(raw, 10);
    } catch {
      return;
    }

    if (lastMs === 0) return;
    if (Date.now() - lastMs <= thresholdMs) return;

    this.logger.warn(
      `ERC-20 deposit poller stale (threshold ${config.ethereum.staleAlertMinutes}m). Last OK: ${new Date(lastMs).toISOString()}`,
    );

    try {
      const locked = await this.redis.set(
        config.ethereum.staleNotifyLockRedisKey,
        '1',
        'EX',
        600,
        'NX',
      );
      if (locked !== 'OK') return;

      const chatId = config.ownerOps.telegramChatId.trim();
      if (chatId) {
        const msg =
          `<b>Ethereum deposit poller alert</b>\n` +
          `No successful ERC-20 poll within ${config.ethereum.staleAlertMinutes} minutes.\n` +
          `Last OK: ${new Date(lastMs).toISOString()}`;
        await this.telegram.sendNotification(chatId, msg);
      }

      await this.opsAlerts.scheduleAlert({
        severity: 'high',
        title: 'Ethereum ERC-20 deposit poller stale',
        lines: [
          `No successful ERC-20 poll within ${config.ethereum.staleAlertMinutes} minutes.`,
          `Last OK: ${new Date(lastMs).toISOString()}`,
        ],
      });
    } catch (e) {
      this.logger.warn(`ERC-20 stale ops notify failed: ${e}`);
    }
  }

  async poll(): Promise<void> {
    await this.maybeAlertStaleEth();

    try {
      this.eth.assertConfigured();
    } catch {
      return;
    }

    const traders = await this.prisma.traderProfile.findMany({
      where: {
        usdtErc20DepositAddress: { not: null },
        isActive: true,
      },
      select: { id: true, usdtErc20DepositAddress: true },
    });

    if (traders.length === 0) return;

    let currentBlock: number;
    try {
      currentBlock = await this.eth.ethBlockNumber();
    } catch {
      return;
    }

    const minConf = Math.max(1, config.ethereum.minConfirmations);
    const minAmt = config.ethereum.minAmountUsdt;
    const chunk = Math.max(100, config.ethereum.maxLogsBlockRange);
    const contract = config.ethereum.usdtContract.trim().toLowerCase();

    let fromBlock = await this.resolveStartBlock(currentBlock);
    if (fromBlock > currentBlock) {
      await this.touchPollSuccess();
      return;
    }

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + chunk - 1, currentBlock);

      for (const t of traders) {
        const addr = t.usdtErc20DepositAddress!;
        let topicTo: string;
        try {
          topicTo = padTopicAddress(addr);
        } catch {
          this.logger.warn(`Invalid ERC-20 deposit address for trader ${t.id}: ${addr}`);
          continue;
        }

        let logs;
        try {
          logs = await this.eth.ethGetLogs({
            fromBlock,
            toBlock,
            address: contract,
            topics: [ERC20_TRANSFER_TOPIC, null, topicTo],
          });
        } catch {
          continue;
        }

        for (const log of logs) {
          const txHash = log.transactionHash;
          if (!txHash) continue;

          const rawAmt = decodeUint256Data(log.data);
          const amountUsdt = Number(rawAmt) / 1e6;
          if (!Number.isFinite(amountUsdt) || amountUsdt < minAmt) continue;

          const txBlock = Number.parseInt(log.blockNumber, 16);
          if (!Number.isFinite(txBlock)) continue;

          const fromT = log.topics?.[1];
          const toT = log.topics?.[2];
          if (fromT && toT && fromT.toLowerCase() === toT.toLowerCase()) {
            continue;
          }

          const confirmations = currentBlock - txBlock + 1;
          if (confirmations < 1) continue;

          const result = await this.walletDeposits.observeAndMaybeCredit(
            t.id,
            txHash,
            amountUsdt,
            confirmations,
            minConf,
            null,
            BlockchainNetwork.ERC20,
          );
          if (result.status === 'credited') {
            this.logger.log(`ERC-20 TOP_UP trader=${t.id} tx=${txHash} amount=${amountUsdt}`);
          }
        }
      }

      if (this.redis) {
        try {
          await this.redis.set(config.ethereum.lastProcessedBlockRedisKey, String(toBlock));
        } catch (e) {
          this.logger.warn(`ERC-20 persist last block failed: ${e}`);
        }
      }

      fromBlock = toBlock + 1;
    }

    await this.touchPollSuccess();
  }

  private async resolveStartBlock(currentBlock: number): Promise<number> {
    let lastProcessed = 0;
    if (this.redis) {
      try {
        const raw = await this.redis.get(config.ethereum.lastProcessedBlockRedisKey);
        if (raw) lastProcessed = parseInt(raw, 10);
      } catch {
        /* ignore */
      }
    }

    if (lastProcessed > 0) {
      return Math.min(lastProcessed + 1, currentBlock);
    }

    const boot = Math.min(
      Math.max(100, config.ethereum.bootstrapBlocksBehind),
      500_000,
    );
    return Math.max(1, currentBlock - boot + 1);
  }
}

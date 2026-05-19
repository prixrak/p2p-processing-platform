import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, WalletSweepStatus } from '@prisma/client';
import { TronWeb } from 'tronweb';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';
import { HashicorpVaultService } from '../trader-wallets/hashicorp-vault.service';
import { TrongridClient } from '../wallet-deposits/trongrid.client';
import { WalletDepositsService } from '../wallet-deposits/wallet-deposits.service';
import { TronEnergyDelegationService } from './tron-energy-delegation.service';
import {
  applySignatureHexToUnsigned,
  digestOfTronRawDataHex,
  encodeTronTrc20TransferParameter,
  unsignedTxFromTriggerResponse,
} from './tron-sweep-transaction.util';

function extractTxId(sendResult: unknown): string {
  if (typeof sendResult === 'string' && sendResult.length > 0) return sendResult;
  if (sendResult && typeof sendResult === 'object') {
    const o = sendResult as Record<string, unknown>;
    const txid = o.txid ?? o.txId ?? o.transaction;
    if (typeof txid === 'string' && txid.length > 0) return txid;
    if (txid && typeof txid === 'object' && 'txID' in txid && typeof (txid as { txID?: string }).txID === 'string') {
      return (txid as { txID: string }).txID;
    }
  }
  throw new Error('Could not parse transaction id from TronWeb send result');
}

/**
 * TZ Sweep Scheduler: on-chain USDT balance vs threshold.
 * Signing uses the optional Vault secrets engine mounted at {@link config.vault.tronSecpSignMount} (`vault-plugin-tron-sign`).
 * Fallback when vault mount unset: KV `readTraderWalletPrivateKeyHex` + TronWeb inside the worker.
 * Virtual DB balance is unchanged on sweep (already credited by Monitor).
 */
@Injectable()
export class WalletSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletSweepService.name);
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Log once: sweep only scans `trader_wallets`, not standalone profile deposit fields. */
  private loggedNoCustodialWalletsForSweep = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trongrid: TrongridClient,
    private readonly vault: HashicorpVaultService,
    private readonly energyDelegation: TronEnergyDelegationService,
    private readonly walletDeposits: WalletDepositsService,
  ) {}

  onModuleInit(): void {
    if (!config.sweep.enabled) {
      this.logger.log('Tron USDT sweep worker disabled (TRON_SWEEP_ENABLED=false)');
      return;
    }
    const cold = config.sweep.coldWalletAddress.trim();
    if (!cold.startsWith('T') || cold.length < 34) {
      this.logger.warn('TRON_SWEEP_COLD_WALLET_ADDRESS is missing or invalid; sweep idle');
      return;
    }
    if (!this.vault.isSweepVaultConfigured()) {
      this.logger.warn('Vault sweep AppRole not configured; sweep idle (keys required)');
      return;
    }

    if (
      config.sweep.requireVaultSecpEngine &&
      Boolean(config.vault.addr?.trim()) &&
      !config.vault.tronSecpSignMount.trim()
    ) {
      this.logger.warn(
        'TRON_SWEEP_REQUIRE_VAULT_SECP_ENGINE=true but VAULT_TRON_SECP_SIGN_MOUNT is unset; sweep idle until configured',
      );
      return;
    }

    if (
      process.env.NODE_ENV === 'production' &&
      config.vault.walletRoleId === config.vault.sweepRoleId &&
      config.vault.walletSecretId === config.vault.sweepSecretId &&
      config.vault.walletRoleId?.trim()
    ) {
      this.logger.warn(
        'Using the same Vault AppRole for wallet and sweep. For TZ-style separation, set VAULT_WALLET_* and VAULT_SWEEP_*.',
      );
    }

    this.redis = new Redis(createRedisConnectionOptions());
    this.subscriber = this.redis.duplicate();

    void this.subscriber.subscribe(config.sweep.sweepCheckChannel).catch((e) => {
      this.logger.warn(`sweep Redis subscribe failed: ${e}`);
    });
    this.subscriber.on('message', (_channel, message) => {
      void this.handleSweepCheckMessage(message);
    });

    const ms = Math.max(300_000, config.sweep.intervalMs);
    void this.sweepAllActive().catch((e) => this.logger.error(e));
    this.timer = setInterval(() => {
      void this.sweepAllActive().catch((e) => this.logger.error(e));
    }, ms);
    this.logger.log(
      `Tron USDT sweep worker started (interval ${ms} ms, threshold ${config.sweep.thresholdUsdt} USDT)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    void this.subscriber?.quit();
    void this.redis?.quit();
  }

  private async handleSweepCheckMessage(message: string): Promise<void> {
    try {
      const p = JSON.parse(message) as { address?: string };
      const addr = typeof p.address === 'string' ? p.address.trim() : '';
      if (!addr.startsWith('T')) return;
      const row = await this.prisma.traderWallet.findFirst({
        where: { address: addr, isActive: true },
        select: { traderId: true, address: true },
      });
      if (row) {
        await this.maybeSweep(row.traderId, row.address);
      }
    } catch (e) {
      this.logger.warn(`sweep_check payload error: ${e}`);
    }
  }

  private async sweepAllActive(): Promise<void> {
    const rows = await this.prisma.traderWallet.findMany({
      where: { isActive: true },
      select: { traderId: true, address: true },
    });
    if (rows.length === 0) {
      if (!this.loggedNoCustodialWalletsForSweep) {
        this.loggedNoCustodialWalletsForSweep = true;
        this.logger.warn(
          'Tron sweep: no active trader_wallets rows. Sweep only runs for Vault-backed custodial addresses ' +
            '(API wallet generation). Profile-only deposit addresses are not swept.',
        );
      }
      return;
    }
    for (const r of rows) {
      await this.maybeSweep(r.traderId, r.address);
    }
  }

  async maybeSweep(traderId: string, fromAddress: string): Promise<void> {
    const cold = config.sweep.coldWalletAddress.trim();
    const publisher = this.redis;
    if (!publisher) return;

    const lockKey = `${config.sweep.lockKeyPrefix}${fromAddress}`;
    const locked = await publisher.set(lockKey, '1', 'EX', config.sweep.lockTtlSec, 'NX');
    if (locked !== 'OK') return;

    let logId: string | null = null;
    let energyDelegated = false;
    try {
      const reconcile = await this.walletDeposits.reconcileTrc20IncomingForAddress(
        traderId,
        fromAddress,
      );
      if (reconcile.credited > 0) {
        this.logger.log(
          `Tron sweep: credited ${reconcile.credited} deposit(s) before sweep trader=${traderId}`,
        );
      }
      if (reconcile.pending > 0) {
        this.logger.warn(
          `Tron sweep deferred: ${reconcile.pending} deposit(s) awaiting confirmations trader=${traderId}`,
        );
        return;
      }
      const stillUncredited = await this.walletDeposits.hasUncreditedTrc20Deposits(
        traderId,
        fromAddress,
      );
      if (stillUncredited) {
        this.logger.warn(
          `Tron sweep deferred: uncredited wallet_deposit row(s) trader=${traderId} address=${fromAddress}`,
        );
        return;
      }

      const balance = await this.trongrid.getAccountUsdtTrc20Balance(fromAddress);
      if (balance === null) {
        this.logger.warn(`sweep: could not read balance ${fromAddress.slice(0, 6)}…`);
        return;
      }
      if (balance < config.sweep.thresholdUsdt) {
        return;
      }

      const trxNative = await this.trongrid.getAccountTrxBalance(fromAddress);
      if (
        trxNative !== null &&
        Number.isFinite(trxNative) &&
        trxNative < config.sweep.trxReserve
      ) {
        this.logger.warn(
          `sweep skipped: native TRX ${trxNative} < TRON_SWEEP_TRX_RESERVE (${config.sweep.trxReserve}) ` +
            `trader=${traderId}`,
        );
        return;
      }

      const amountSun = Math.floor(balance * 1e6);
      if (amountSun <= 0) return;

      energyDelegated = await this.energyDelegation.delegateEnergyToTraderAddress(fromAddress);
      if (energyDelegated && config.tron.delegateEnergyWaitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, config.tron.delegateEnergyWaitMs));
      }

      const sweepRow = await this.prisma.walletSweepLog.create({
        data: {
          traderId,
          fromAddress,
          toAddress: cold,
          amountUsdt: balance,
          status: WalletSweepStatus.PENDING,
        },
      });
      logId = sweepRow.id;

      let txId: string;
      const secpMount = config.vault.tronSecpSignMount.trim();

      if (secpMount) {
        const exists = await this.vault.peekTronSecpSignerAccount(traderId);
        if (!exists) {
          const migPk = await this.vault.readTraderWalletPrivateKeyHex(traderId);
          await this.vault.upsertTronSecpSignerAccountSweep(traderId, migPk);
          this.logger.log(
            `Tron sweep: migrated trader key into Vault tron-sign engine trader=${traderId} (prefer proactive registration on wallet create)`,
          );
        }

        const paramHex = encodeTronTrc20TransferParameter(cold, amountSun);
        const trig = await this.trongrid.triggerSmartContract({
          ownerAddressBase58: fromAddress,
          contractAddressBase58: config.tron.usdtTrc20Contract,
          functionSelector: 'transfer(address,uint256)',
          parameterHexNoPrefix: paramHex,
          feeLimit: 150_000_000,
          callValue: 0,
        });
        const unsigned = unsignedTxFromTriggerResponse(trig);
        const rawHex = unsigned.raw_data_hex;
        if (typeof rawHex !== 'string' || rawHex.length < 32) {
          throw new Error('Trigger response missing raw_data_hex');
        }
        const digestHex = digestOfTronRawDataHex(rawHex).toString('hex');
        const sig = await this.vault.signTronSweepDigestViaSecpEngine(traderId, digestHex);
        const signed = applySignatureHexToUnsigned(unsigned, sig);
        const out = await this.trongrid.broadcastSignedTransaction(signed);
        txId = out.txId;
      } else {
        const pk = await this.vault.readTraderWalletPrivateKeyHex(traderId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tw: any = new TronWeb({
          fullHost: config.tron.baseUrl,
          headers: config.tron.apiKey ? { 'TRON-PRO-API-KEY': config.tron.apiKey } : {},
        });
        tw.setPrivateKey(pk);

        const contract = await tw.contract().at(config.tron.usdtTrc20Contract);
        const sendRes = await contract.methods.transfer(cold, amountSun).send({
          feeLimit: 150_000_000,
          callValue: 0,
          shouldPollResponse: false,
        });

        txId = extractTxId(sendRes);
      }

      await this.prisma.walletSweepLog.update({
        where: { id: logId },
        data: {
          status: WalletSweepStatus.BROADCAST,
          txHash: txId,
        },
      });

      this.logger.log(
        `Tron SWEEP broadcast trader=${traderId} from=${fromAddress} amount=${balance} tx=${txId}`,
      );

      void this.awaitSweepChainConfirmation(logId, txId).catch((err) =>
        this.logger.warn(`sweep confirm poll failed log=${logId} tx=${txId}: ${err}`),
      );
    } catch (e) {
      this.logger.warn(`Tron SWEEP failed trader=${traderId} ${fromAddress}: ${e}`);
      if (logId) {
        await this.prisma.walletSweepLog
          .update({
            where: { id: logId },
            data: {
              status: WalletSweepStatus.FAILED,
              error: String(e),
            },
          })
          .catch(() => undefined);
      }
    } finally {
      if (energyDelegated) {
        await this.energyDelegation
          .undelegateEnergyFromTraderAddress(fromAddress)
          .catch(() => undefined);
      }
      await publisher.del(lockKey).catch(() => undefined);
    }
  }

  /**
   * Poll TronGrid until sweep tx is included, then set status CONFIRMED and fee (TZ sweep_log).
   */
  private async awaitSweepChainConfirmation(logId: string, txId: string): Promise<void> {
    const pollMs = Math.max(1500, config.sweep.confirmPollMs);
    const maxWait = Math.max(pollMs, config.sweep.confirmMaxWaitMs);
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      const outcome = await this.trongrid.getTransactionOutcome(txId);
      if (outcome) {
        const r = outcome.receiptResult.trim().toUpperCase();
        if (r === 'SUCCESS') {
          const feeTrx = new Prisma.Decimal(outcome.feeSun).div(new Prisma.Decimal(1e6));
          await this.prisma.walletSweepLog.update({
            where: { id: logId },
            data: {
              status: WalletSweepStatus.CONFIRMED,
              confirmedAt: new Date(),
              feeTrx,
            },
          });
          this.logger.log(`Tron SWEEP confirmed log=${logId} tx=${txId} fee_trx=${feeTrx.toString()}`);
          return;
        }
        if (r === '' || r === 'UNKNOWN') {
          await new Promise<void>((res) => setTimeout(res, pollMs));
          continue;
        }
        const feeTrx = new Prisma.Decimal(outcome.feeSun).div(new Prisma.Decimal(1e6));
        await this.prisma.walletSweepLog
          .update({
            where: { id: logId },
            data: {
              status: WalletSweepStatus.FAILED,
              error: `Chain receipt: ${outcome.receiptResult}`,
              feeTrx,
            },
          })
          .catch(() => undefined);
        this.logger.warn(`Tron SWEEP chain failed log=${logId} tx=${txId} ${outcome.receiptResult}`);
        return;
      }
      await new Promise<void>((res) => setTimeout(res, pollMs));
    }

    this.logger.warn(`Tron SWEEP confirmation timeout log=${logId} tx=${txId} (still BROADCAST)`);
  }
}

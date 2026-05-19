import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BalanceTransactionType,
  BlockchainNetwork,
  Prisma,
  SettlementTypeEnum,
} from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import type { WalletDepositConfirmDto } from '../admin/dto/wallet-deposit-confirm.dto';
import { config } from '@p2p/config';
import { TrongridClient, normalizeTronAddress } from './trongrid.client';
import { WalletDepositEventsService } from './wallet-deposit-events.service';
import { CurrenciesService } from '../currencies/currencies.service';

function tronReceiptIndicatesFailure(receiptResult: string): boolean {
  const r = receiptResult.trim().toUpperCase();
  return r.length > 0 && r !== 'SUCCESS' && r !== 'UNKNOWN';
}

export type CreditDepositParams = {
  traderId: string;
  txHash: string;
  network: BlockchainNetwork;
  amountUsdt: number;
  confirmations: number;
  /** Null when credited by chain worker. */
  actorId: string | null;
  toAddress?: string | null;
  blockNumber?: bigint | number | null;
};

@Injectable()
export class WalletDepositsService {
  private readonly logger = new Logger(WalletDepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly depositEvents: WalletDepositEventsService,
    private readonly trongrid: TrongridClient,
    private readonly currencies: CurrenciesService,
  ) {}

  /**
   * Scan recent TRC-20 transfers to `depositAddress` and credit any incoming USDT not yet in `wallet_deposits`.
   * Used by the deposit poller and before sweep so funds are never moved to cold storage without TOP_UP.
   */
  async reconcileTrc20IncomingForAddress(
    traderId: string,
    depositAddress: string,
  ): Promise<{ credited: number; pending: number }> {
    const addr = normalizeTronAddress(depositAddress);
    if (!addr) {
      return { credited: 0, pending: 0 };
    }

    const currentBlock = await this.trongrid.getNowBlockNumber();
    if (currentBlock === null) {
      return { credited: 0, pending: 0 };
    }

    const minConf = Math.max(1, config.tron.minConfirmations);
    const minAmt = config.tron.minAmountUsdt;
    const rows = await this.trongrid.listRecentUsdtTrc20(addr);
    const blockCache = new Map<string, number | null>();
    let credited = 0;
    let pending = 0;

    for (const row of rows) {
      const txId = row.transaction_id;
      if (!txId) continue;

      const toNorm = normalizeTronAddress(row.to ?? '');
      const fromNorm = normalizeTronAddress(row.from ?? '');
      if (!toNorm || toNorm !== addr) continue;
      if (fromNorm === addr) continue;

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

      const result = await this.observeAndMaybeCredit(
        traderId,
        txId,
        amountUsdt,
        confirmations,
        minConf,
        null,
        BlockchainNetwork.TRC20,
        { toAddress: addr, blockNumber: txBlock },
      );
      if (result.status === 'credited') {
        credited += 1;
      } else if (result.status === 'pending') {
        pending += 1;
      }
    }

    return { credited, pending };
  }

  /** True when this trader still has on-chain deposits observed but not yet credited (TOP_UP). */
  async hasUncreditedTrc20Deposits(traderId: string, depositAddress: string): Promise<boolean> {
    const addr = normalizeTronAddress(depositAddress);
    if (!addr) return false;

    const count = await this.prisma.walletDeposit.count({
      where: {
        traderId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [{ toAddress: addr }, { toAddress: null }],
      },
    });
    return count > 0;
  }

  /**
   * If confirmations are below threshold, upsert PENDING. Otherwise credit once (idempotent by tx_hash).
   */
  async observeAndMaybeCredit(
    traderId: string,
    txHash: string,
    amountUsdt: number,
    confirmations: number,
    minConfirmations: number,
    actorId: string | null,
    network: BlockchainNetwork,
    chainCtx?: { toAddress?: string | null; blockNumber?: bigint | number | null },
  ): Promise<{ status: 'pending' | 'credited' | 'skipped' | 'failed'; depositId?: string }> {
    if (amountUsdt <= 0 || !Number.isFinite(amountUsdt)) {
      return { status: 'skipped' };
    }

    const existingTop = await this.prisma.walletDeposit.findUnique({
      where: { txHash },
    });
    if (existingTop?.status === 'FAILED') {
      return { status: 'skipped', depositId: existingTop.id };
    }
    if (existingTop?.status === 'CREDITED') {
      return { status: 'skipped', depositId: existingTop.id };
    }

    const failGate = await this.gateTronChainRejectedDeposit({
      traderId,
      txHash,
      network,
      amountUsdt,
      confirmations,
      chainCtx,
      existing: existingTop,
    });
    if (failGate) {
      return failGate;
    }

    if (confirmations < minConfirmations) {
      if (existingTop && existingTop.traderId !== traderId) {
        this.logger.warn(`tx_hash ${txHash} linked to another trader; skipping`);
        return { status: 'skipped' };
      }

      const interimStatus = confirmations >= 1 ? 'CONFIRMED' : 'PENDING';

      await this.prisma.walletDeposit.upsert({
        where: { txHash },
        create: {
          traderId,
          txHash,
          network,
          amountUsdt,
          confirmations,
          status: interimStatus,
          toAddress: chainCtx?.toAddress ?? undefined,
          blockNumber:
            chainCtx?.blockNumber !== undefined && chainCtx?.blockNumber !== null
              ? BigInt(String(chainCtx.blockNumber))
              : undefined,
        },
        update: {
          amountUsdt,
          confirmations,
          traderId,
          network,
          status: interimStatus,
          ...(chainCtx?.toAddress ? { toAddress: chainCtx.toAddress } : {}),
          ...(chainCtx?.blockNumber !== undefined && chainCtx?.blockNumber !== null
            ? { blockNumber: BigInt(String(chainCtx.blockNumber)) }
            : {}),
        },
      });
      return { status: 'pending' };
    }

    const deposit = await this.creditDepositAtomic({
      traderId,
      txHash,
      network,
      amountUsdt,
      confirmations,
      actorId,
      toAddress: chainCtx?.toAddress,
      blockNumber: chainCtx?.blockNumber,
    });
    return { status: 'credited', depositId: deposit.id };
  }

  /**
   * When TronGrid reports a finalized tx with a non-success receipt, record {@link WalletDepositStatus.FAILED}.
   */
  private async gateTronChainRejectedDeposit(params: {
    traderId: string;
    txHash: string;
    network: BlockchainNetwork;
    amountUsdt: number;
    confirmations: number;
    chainCtx?: { toAddress?: string | null; blockNumber?: bigint | number | null };
    existing: { id: string; traderId: string; status: string } | null;
  }): Promise<{ status: 'failed'; depositId: string } | { status: 'skipped' } | null> {
    if (params.network !== BlockchainNetwork.TRC20) {
      return null;
    }
    const outcome = await this.trongrid.getTransactionOutcome(params.txHash);
    if (!outcome || !tronReceiptIndicatesFailure(outcome.receiptResult)) {
      return null;
    }

    if (params.existing?.status === 'CREDITED') {
      this.logger.error(
        `TRC-20 tx has non-success receipt but deposit already credited tx=${params.txHash} receipt=${outcome.receiptResult}`,
      );
      return { status: 'skipped' };
    }
    if (params.existing && params.existing.traderId !== params.traderId) {
      this.logger.warn(
        `tx_hash ${params.txHash} failed on chain but row belongs to another trader; skipping`,
      );
      return { status: 'skipped' };
    }

    const row = await this.prisma.walletDeposit.upsert({
      where: { txHash: params.txHash },
      create: {
        traderId: params.traderId,
        txHash: params.txHash,
        network: params.network,
        amountUsdt: params.amountUsdt,
        confirmations: params.confirmations,
        status: 'FAILED',
        toAddress: params.chainCtx?.toAddress ?? undefined,
        blockNumber:
          params.chainCtx?.blockNumber !== undefined && params.chainCtx?.blockNumber !== null
            ? BigInt(String(params.chainCtx.blockNumber))
            : undefined,
      },
      update: {
        traderId: params.traderId,
        amountUsdt: params.amountUsdt,
        confirmations: params.confirmations,
        network: params.network,
        status: 'FAILED',
        ...(params.chainCtx?.toAddress ? { toAddress: params.chainCtx.toAddress } : {}),
        ...(params.chainCtx?.blockNumber !== undefined && params.chainCtx?.blockNumber !== null
          ? { blockNumber: BigInt(String(params.chainCtx.blockNumber)) }
          : {}),
      },
    });

    this.logger.warn(
      `Wallet deposit marked FAILED (TRC-20 receipt) tx=${params.txHash} receipt=${outcome.receiptResult}`,
    );
    return { status: 'failed', depositId: row.id };
  }

  /**
   * Manual admin confirmation (any supported network).
   */
  async confirmManual(dto: WalletDepositConfirmDto, adminId: string) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: dto.trader_id },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${dto.trader_id} not found`);
    }

    const existing = await this.prisma.walletDeposit.findUnique({
      where: { txHash: dto.tx_hash },
    });
    if (existing?.status === 'FAILED') {
      throw new BadRequestException('This on-chain transaction was marked failed and cannot be credited');
    }
    if (existing?.status === 'CREDITED') {
      throw new BadRequestException('This transaction was already credited');
    }
    if (existing && existing.traderId !== dto.trader_id) {
      throw new BadRequestException('tx_hash belongs to another trader');
    }

    if (dto.network === BlockchainNetwork.TRC20) {
      const outcome = await this.trongrid.getTransactionOutcome(dto.tx_hash);
      if (outcome && tronReceiptIndicatesFailure(outcome.receiptResult)) {
        throw new BadRequestException(
          `On-chain receipt is not successful (${outcome.receiptResult}); cannot credit this deposit`,
        );
      }
    }

    return this.creditDepositAtomic({
      traderId: dto.trader_id,
      txHash: dto.tx_hash,
      network: dto.network,
      amountUsdt: dto.amount_usdt,
      confirmations: dto.confirmations,
      actorId: adminId,
    });
  }

  /**
   * RISK NOTE: increments trader USDT once per tx_hash; Serializable isolation prevents double credit.
   */
  async creditDepositAtomic(params: CreditDepositParams) {
    let skipRealtime = false;
    const usdtId = await this.currencies.getUsdtCurrencyId();
    const deposit = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.walletDeposit.findUnique({
          where: { txHash: params.txHash },
        });
        if (existing?.status === 'CREDITED') {
          skipRealtime = true;
          return existing;
        }
        if (existing?.status === 'FAILED') {
          throw new BadRequestException('Cannot credit a failed on-chain deposit for this tx hash');
        }
        if (existing && existing.traderId !== params.traderId) {
          throw new BadRequestException('tx_hash belongs to another trader');
        }

        const toAddr = params.toAddress ?? existing?.toAddress ?? undefined;
        const blk =
          params.blockNumber !== undefined && params.blockNumber !== null
            ? BigInt(String(params.blockNumber))
            : existing?.blockNumber ?? undefined;

        const depositRow = existing
          ? await tx.walletDeposit.update({
              where: { txHash: params.txHash },
              data: {
                network: params.network,
                amountUsdt: params.amountUsdt,
                confirmations: params.confirmations,
                status: 'CREDITED',
                creditedAt: new Date(),
                ...(toAddr ? { toAddress: toAddr } : {}),
                ...(blk !== undefined ? { blockNumber: blk } : {}),
              },
            })
          : await tx.walletDeposit.create({
              data: {
                traderId: params.traderId,
                txHash: params.txHash,
                network: params.network,
                amountUsdt: params.amountUsdt,
                confirmations: params.confirmations,
                status: 'CREDITED',
                creditedAt: new Date(),
                ...(toAddr ? { toAddress: toAddr } : {}),
                ...(blk !== undefined ? { blockNumber: blk } : {}),
              },
            });

        await tx.traderBalance.upsert({
          where: {
            traderId_currencyId: {
              traderId: params.traderId,
              currencyId: usdtId,
            },
          },
          create: {
            traderId: params.traderId,
            currencyId: usdtId,
            amount: params.amountUsdt,
            totalDeposited: params.amountUsdt,
          },
          update: {
            amount: { increment: params.amountUsdt },
            totalDeposited: { increment: params.amountUsdt },
          },
        });

        const topUpNote = `On-chain deposit ${params.txHash} (${params.network})`;

        await this.balanceTxService.record({
          traderId: params.traderId,
          type: BalanceTransactionType.TOP_UP,
          amount: params.amountUsdt,
          currency: 'USDT',
          referenceId: depositRow.id,
          createdById: params.actorId ?? undefined,
          comment: topUpNote,
          tx,
        });

        await tx.settlement.create({
          data: {
            adminId: params.actorId,
            traderId: params.traderId,
            type: SettlementTypeEnum.CREDIT,
            amount: params.amountUsdt,
            currencyId: usdtId,
            note: topUpNote,
            walletDepositId: depositRow.id,
          },
        });

        if (params.actorId) {
          await tx.auditLog.create({
            data: {
              actorId: params.actorId,
              action: 'wallet_deposit_credited',
              entityType: 'WalletDeposit',
              entityId: depositRow.id,
              newValue: {
                txHash: params.txHash,
                amountUsdt: params.amountUsdt,
                network: params.network,
              },
            },
          });
        } else {
          await tx.auditLog.create({
            data: {
              action: 'wallet_deposit_credited_auto',
              entityType: 'WalletDeposit',
              entityId: depositRow.id,
              newValue: {
                txHash: params.txHash,
                amountUsdt: params.amountUsdt,
                network: params.network,
                traderId: params.traderId,
              },
            },
          });
        }

        this.logger.log(
          `Wallet deposit credited: trader=${params.traderId} amount=${params.amountUsdt} tx=${params.txHash}`,
        );

        return depositRow;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (
      !skipRealtime &&
      WalletDepositEventsService.shouldPublish(params.network, params.actorId)
    ) {
      const depositAddr = deposit.toAddress ?? params.toAddress ?? null;
      let onChainBalance = Number(deposit.amountUsdt);
      if (depositAddr?.startsWith('T')) {
        const live = await this.trongrid.getAccountUsdtTrc20Balance(depositAddr);
        if (live !== null && Number.isFinite(live)) {
          onChainBalance = live;
        }
      }
      await this.depositEvents.publishAfterTrc20Credit({
        traderId: params.traderId,
        txHash: params.txHash,
        amountUsdt: deposit.amountUsdt.toString(),
        toAddress: depositAddr,
        sweepBalanceHint: onChainBalance.toFixed(6),
      });
    }

    return deposit;
  }
}

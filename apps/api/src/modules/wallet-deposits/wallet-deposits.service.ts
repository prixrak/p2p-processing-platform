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
} from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import type { WalletDepositConfirmDto } from '../admin/dto/wallet-deposit-confirm.dto';

export type CreditDepositParams = {
  traderId: string;
  txHash: string;
  network: BlockchainNetwork;
  amountUsdt: number;
  confirmations: number;
  /** Null when credited by chain worker. */
  actorId: string | null;
};

@Injectable()
export class WalletDepositsService {
  private readonly logger = new Logger(WalletDepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
  ) {}

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
  ): Promise<{ status: 'pending' | 'credited' | 'skipped'; depositId?: string }> {
    if (amountUsdt <= 0 || !Number.isFinite(amountUsdt)) {
      return { status: 'skipped' };
    }

    if (confirmations < minConfirmations) {
      const existing = await this.prisma.walletDeposit.findUnique({
        where: { txHash },
      });
      if (existing?.status === 'CREDITED') {
        return { status: 'skipped', depositId: existing.id };
      }
      if (existing && existing.traderId !== traderId) {
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
        },
        update: {
          amountUsdt,
          confirmations,
          traderId,
          network,
          status: interimStatus,
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
    });
    return { status: 'credited', depositId: deposit.id };
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
    if (existing?.status === 'CREDITED') {
      throw new BadRequestException('This transaction was already credited');
    }
    if (existing && existing.traderId !== dto.trader_id) {
      throw new BadRequestException('tx_hash belongs to another trader');
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
  creditDepositAtomic(params: CreditDepositParams) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.walletDeposit.findUnique({
          where: { txHash: params.txHash },
        });
        if (existing?.status === 'CREDITED') {
          return existing;
        }
        if (existing && existing.traderId !== params.traderId) {
          throw new BadRequestException('tx_hash belongs to another trader');
        }

        const deposit = existing
          ? await tx.walletDeposit.update({
              where: { txHash: params.txHash },
              data: {
                network: params.network,
                amountUsdt: params.amountUsdt,
                confirmations: params.confirmations,
                status: 'CREDITED',
                creditedAt: new Date(),
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
              },
            });

        await tx.traderBalance.upsert({
          where: {
            traderId_currency: {
              traderId: params.traderId,
              currency: 'USDT',
            },
          },
          create: {
            traderId: params.traderId,
            currency: 'USDT',
            amount: params.amountUsdt,
          },
          update: { amount: { increment: params.amountUsdt } },
        });

        await this.balanceTxService.record({
          traderId: params.traderId,
          type: BalanceTransactionType.TOP_UP,
          amount: params.amountUsdt,
          currency: 'USDT',
          referenceId: deposit.id,
          createdById: params.actorId ?? undefined,
          comment: `On-chain deposit ${params.txHash} (${params.network})`,
          tx,
        });

        if (params.actorId) {
          await tx.auditLog.create({
            data: {
              actorId: params.actorId,
              action: 'wallet_deposit_credited',
              entityType: 'WalletDeposit',
              entityId: deposit.id,
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
              entityId: deposit.id,
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

        return deposit;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

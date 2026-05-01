import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BalanceTransactionType, Prisma } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { CurrenciesService } from '../currencies/currencies.service';

export interface CreateBalanceTxParams {
  traderId: string;
  type: BalanceTransactionType;
  amount: number;
  currency: string;
  referenceId?: string;
  createdById?: string;
  comment?: string;
  tx?: Prisma.TransactionClient;
}

export interface ListBalanceTxFilters {
  traderId?: string;
  type?: BalanceTransactionType;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class BalanceTransactionsService {
  private readonly logger = new Logger(BalanceTransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly currencies: CurrenciesService,
  ) {}

  /**
   * Record a balance transaction.
   * Pass `tx` to execute inside an existing Prisma transaction.
   */
  async record(params: CreateBalanceTxParams) {
    const client = params.tx ?? this.prisma;

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(params.currency);

    const record = await client.balanceTransaction.create({
      data: {
        traderId: params.traderId,
        type: params.type,
        amount: params.amount,
        currencyId,
        referenceId: params.referenceId,
        createdById: params.createdById,
        comment: params.comment,
      },
    });

    this.logger.log(
      `BalanceTx: ${params.type} ${params.amount} ${params.currency} trader=${params.traderId} ref=${params.referenceId ?? '-'}`,
    );

    if (this.currencies.normalizeCode(params.currency) === 'USDT') {
      this.telegram.scheduleTraderSettlementHandbookAlerts({
        traderId: params.traderId,
        balanceTxType: params.type,
        topUpAmountUsdt:
          params.type === BalanceTransactionType.TOP_UP ? params.amount : undefined,
      });
    }

    return record;
  }

  async findByTrader(traderId: string, filters: ListBalanceTxFilters, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where: Prisma.BalanceTransactionWhereInput = { traderId };

    if (filters.type) where.type = filters.type;
    if (filters.currency) {
      const cid = await this.currencies.findCurrencyIdByCode(filters.currency);
      if (!cid) {
        return { data: [], total: 0, page, limit };
      }
      where.currencyId = cid;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [rows, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          createdBy: { select: { email: true } },
          currency: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);

    const refIds = rows
      .filter((r) => r.type === BalanceTransactionType.TOP_UP && r.referenceId)
      .map((r) => r.referenceId!);
    let depById = new Map<string, { status: string }>();
    if (refIds.length > 0) {
      const deps = await this.prisma.walletDeposit.findMany({
        where: { traderId, id: { in: refIds } },
        select: { id: true, status: true },
      });
      depById = new Map(deps.map((d) => [d.id, d]));
    }

    const data = rows.map((row) => {
      const dep =
        row.type === BalanceTransactionType.TOP_UP && row.referenceId
          ? depById.get(row.referenceId)
          : undefined;
      const { currency, ...rest } = row;
      return {
        ...rest,
        currency: currency.code,
        /** When this TOP_UP row links to an on-chain monitored deposit, echo chain status (older rows may show null). */
        on_chain_deposit_status: dep?.status ?? null,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Direct manual credit or debit of trader balance (admin action).
   * Atomically updates TraderBalance and records a MANUAL_CREDIT / MANUAL_DEBIT
   * transaction. Does NOT create a Settlement record — use settlements for
   * formal financial reconciliation.
   */
  async adminAdjust(params: {
    traderId: string;
    type: 'MANUAL_CREDIT' | 'MANUAL_DEBIT';
    amount: number;
    currency: string;
    comment?: string;
    adminId: string;
  }) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: params.traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${params.traderId} not found`);
    }

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(params.currency);
    const curCode = this.currencies.normalizeCode(params.currency);

    return this.prisma.$transaction(async (tx) => {
      let balance = await tx.traderBalance.findUnique({
        where: { traderId_currencyId: { traderId: params.traderId, currencyId } },
      });

      if (!balance) {
        balance = await tx.traderBalance.create({
          data: { traderId: params.traderId, currencyId, amount: 0 },
        });
      }

      if (params.type === 'MANUAL_DEBIT') {
        const current = Number(balance.amount);
        if (curCode === 'USDT') {
          const profile = await tx.traderProfile.findUnique({
            where: { id: params.traderId },
            select: { overdraftLimit: true },
          });
          const limit = Number(profile?.overdraftLimit ?? 0);
          if (current - params.amount < -limit) {
            throw new BadRequestException(
              `Insufficient balance (incl. overdraft ${limit} USDT): current=${balance.amount}, requested debit=${params.amount}`,
            );
          }
        } else if (current < params.amount) {
          throw new BadRequestException(
            `Insufficient balance: current=${balance.amount}, requested debit=${params.amount}`,
          );
        }
      }

      const delta = params.type === 'MANUAL_CREDIT' ? params.amount : -params.amount;

      await tx.traderBalance.update({
        where: { traderId_currencyId: { traderId: params.traderId, currencyId } },
        data: { amount: { increment: delta } },
      });

      const txRecord = await tx.balanceTransaction.create({
        data: {
          traderId: params.traderId,
          type: params.type as BalanceTransactionType,
          amount: params.amount,
          currencyId,
          createdById: params.adminId,
          comment: params.comment,
        },
        include: { createdBy: { select: { email: true } }, currency: { select: { code: true } } },
      });

      this.logger.log(
        `Admin adjust: ${params.type} ${params.amount} ${params.currency} trader=${params.traderId} by=${params.adminId}`,
      );

      return txRecord;
    })
      .then((txRecord) => {
        if (curCode === 'USDT') {
          this.telegram.scheduleTraderSettlementHandbookAlerts({
            traderId: params.traderId,
            balanceTxType:
              params.type === 'MANUAL_CREDIT'
                ? BalanceTransactionType.MANUAL_CREDIT
                : BalanceTransactionType.MANUAL_DEBIT,
          });
        }
        const { currency, ...rest } = txRecord;
        return { ...rest, currency: currency.code };
      });
  }

  async findAll(filters: ListBalanceTxFilters, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where: Prisma.BalanceTransactionWhereInput = {};

    if (filters.traderId) where.traderId = filters.traderId;
    if (filters.type) where.type = filters.type;
    if (filters.currency) {
      const cid = await this.currencies.findCurrencyIdByCode(filters.currency);
      if (!cid) {
        return { data: [], total: 0, page, limit };
      }
      where.currencyId = cid;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [rows, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          createdBy: { select: { email: true } },
          trader: { include: { user: { select: { email: true } } } },
          currency: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);

    const data = rows.map(({ currency, ...rest }) => ({
      ...rest,
      currency: currency.code,
    }));

    return { data, total, page, limit };
  }
}

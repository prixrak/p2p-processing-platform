import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BalanceTransactionType, Prisma } from '@prisma/client';

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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a balance transaction.
   * Pass `tx` to execute inside an existing Prisma transaction.
   */
  async record(params: CreateBalanceTxParams) {
    const client = params.tx ?? this.prisma;

    const record = await client.balanceTransaction.create({
      data: {
        traderId: params.traderId,
        type: params.type,
        amount: params.amount,
        currency: params.currency,
        referenceId: params.referenceId,
        createdById: params.createdById,
        comment: params.comment,
      },
    });

    this.logger.log(
      `BalanceTx: ${params.type} ${params.amount} ${params.currency} trader=${params.traderId} ref=${params.referenceId ?? '-'}`,
    );

    return record;
  }

  async findByTrader(traderId: string, filters: ListBalanceTxFilters, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where: Prisma.BalanceTransactionWhereInput = { traderId };

    if (filters.type) where.type = filters.type;
    if (filters.currency) where.currency = filters.currency;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        skip,
        take: limit,
        include: { createdBy: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findAll(filters: ListBalanceTxFilters, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where: Prisma.BalanceTransactionWhereInput = {};

    if (filters.traderId) where.traderId = filters.traderId;
    if (filters.type) where.type = filters.type;
    if (filters.currency) where.currency = filters.currency;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          createdBy: { select: { email: true } },
          trader: { include: { user: { select: { email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateSettlementDto, FilterSettlementsDto } from './dto';
import { SettlementType } from '@p2p/shared';
import { SettlementTypeEnum, BalanceTransactionType, Prisma } from '@prisma/client';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
  ) {}

  /**
   * Create a settlement and atomically update the trader's balance
   * in the same transaction.
   *
   * RISK NOTE: This method modifies trader balances. The balance update
   * and settlement record are wrapped in a single DB transaction to
   * guarantee consistency. A DEBIT that would bring balance below zero
   * is rejected.
   */
  async create(adminId: string, dto: CreateSettlementDto) {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: dto.traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${dto.traderId} not found`);
    }

    const prismaType =
      dto.type === SettlementType.CREDIT
        ? SettlementTypeEnum.CREDIT
        : SettlementTypeEnum.DEBIT;

    return this.prisma.$transaction(async (tx) => {
      let balance = await tx.traderBalance.findUnique({
        where: {
          traderId_currency: {
            traderId: dto.traderId,
            currency: dto.currency,
          },
        },
      });

      if (!balance) {
        balance = await tx.traderBalance.create({
          data: {
            traderId: dto.traderId,
            currency: dto.currency,
            amount: 0,
          },
        });
      }

      if (
        dto.type === SettlementType.DEBIT &&
        Number(balance.amount) < dto.amount
      ) {
        throw new BadRequestException(
          `Insufficient balance: current=${balance.amount}, requested debit=${dto.amount}`,
        );
      }

      const amountDelta =
        dto.type === SettlementType.CREDIT ? dto.amount : -dto.amount;

      await tx.traderBalance.update({
        where: {
          traderId_currency: {
            traderId: dto.traderId,
            currency: dto.currency,
          },
        },
        data: {
          amount: { increment: amountDelta },
        },
      });

      const settlement = await tx.settlement.create({
        data: {
          adminId,
          traderId: dto.traderId,
          type: prismaType,
          amount: dto.amount,
          currency: dto.currency,
          note: dto.note,
        },
        include: {
          admin: { select: { email: true } },
          trader: {
            include: {
              user: { select: { email: true } },
              balances: true,
            },
          },
        },
      });

      const txType =
        dto.type === SettlementType.CREDIT
          ? BalanceTransactionType.MANUAL_CREDIT
          : BalanceTransactionType.MANUAL_DEBIT;

      await this.balanceTxService.record({
        traderId: dto.traderId,
        type: txType,
        amount: dto.amount,
        currency: dto.currency,
        referenceId: settlement.id,
        createdById: adminId,
        comment: dto.note,
        tx,
      });

      this.logger.log(
        `Settlement created: ${settlement.id} | ${dto.type} ${dto.amount} ${dto.currency} | trader=${dto.traderId} admin=${adminId}`,
      );

      return settlement;
    });
  }

  async findAll(
    filters: FilterSettlementsDto,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.SettlementWhereInput = {};

    if (filters.traderId) where.traderId = filters.traderId;
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.currency) where.currency = filters.currency;

    if (filters.type) {
      where.type =
        filters.type === SettlementType.CREDIT
          ? SettlementTypeEnum.CREDIT
          : SettlementTypeEnum.DEBIT;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        skip,
        take: limit,
        include: {
          admin: { select: { email: true } },
          trader: {
            include: { user: { select: { email: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return { data: settlements, total, page, limit };
  }

  async findOne(id: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      include: {
        admin: { select: { email: true } },
        trader: {
          include: { user: { select: { email: true } } },
        },
      },
    });
    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }
    return settlement;
  }
}

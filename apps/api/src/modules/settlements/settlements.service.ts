import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateSettlementDto, FilterSettlementsDto } from './dto';
import { SettlementType } from '@p2p/shared';
import {
  SettlementTypeEnum,
  BalanceTransactionType,
  PayoutTraderBalanceTxType,
  MerchantBalanceTransactionType,
  Prisma,
} from '@prisma/client';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import { TelegramService } from '../telegram/telegram.service';
import { CurrenciesService } from '../currencies/currencies.service';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly telegram: TelegramService,
    private readonly currencies: CurrenciesService,
  ) {}

  /**
   * Create a settlement and atomically update balances.
   *
   * RISK NOTE: modifies trader, Pay-Out specialist, or merchant balances. DEBIT cannot exceed available
   * balance (standard traders may use USDT overdraft within profile limit; specialists and merchants cannot).
   */
  async create(adminId: string, dto: CreateSettlementDto) {
    const n =
      Number(Boolean(dto.traderId)) +
      Number(Boolean(dto.payoutTraderId)) +
      Number(Boolean(dto.merchantId));
    if (n !== 1) {
      throw new BadRequestException(
        'Provide exactly one of traderId, payoutTraderId, or merchantId',
      );
    }

    if (dto.merchantId) {
      return this.createMerchantSettlement(adminId, dto);
    }
    if (dto.payoutTraderId) {
      return this.createPayoutSpecialistSettlement(adminId, dto);
    }
    return this.createStandardTraderSettlement(adminId, dto);
  }

  private async createStandardTraderSettlement(adminId: string, dto: CreateSettlementDto) {
    const traderId = dto.traderId!;
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) {
      throw new NotFoundException(`Trader ${traderId} not found`);
    }

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    const prismaType =
      dto.type === SettlementType.CREDIT
        ? SettlementTypeEnum.CREDIT
        : SettlementTypeEnum.DEBIT;

    return this.prisma.$transaction(async (tx) => {
      let balance = await tx.traderBalance.findUnique({
        where: {
          traderId_currencyId: {
            traderId,
            currencyId,
          },
        },
      });

      if (!balance) {
        balance = await tx.traderBalance.create({
          data: {
            traderId,
            currencyId,
            amount: 0,
          },
        });
      }

      if (dto.type === SettlementType.DEBIT) {
        const current = Number(balance.amount);
        if (this.currencies.normalizeCode(dto.currency) === 'USDT') {
          const profile = await tx.traderProfile.findUnique({
            where: { id: traderId },
            select: { overdraftLimit: true },
          });
          const limit = Number(profile?.overdraftLimit ?? 0);
          if (current - dto.amount < -limit) {
            throw new BadRequestException(
              `Insufficient balance (incl. overdraft ${limit} USDT): current=${balance.amount}, requested debit=${dto.amount}`,
            );
          }
        } else if (current < dto.amount) {
          throw new BadRequestException(
            `Insufficient balance: current=${balance.amount}, requested debit=${dto.amount}`,
          );
        }
      }

      const amountDelta =
        dto.type === SettlementType.CREDIT ? dto.amount : -dto.amount;

      await tx.traderBalance.update({
        where: {
          traderId_currencyId: {
            traderId,
            currencyId,
          },
        },
        data: {
          amount: { increment: amountDelta },
        },
      });

      const settlement = await tx.settlement.create({
        data: {
          adminId,
          traderId,
          type: prismaType,
          amount: dto.amount,
          currencyId,
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

      // Manual fiat credits remain adjustments; confirmed USDT top-ups align with handbook TOP_UP rows.
      const txType = (() => {
        if (dto.type === SettlementType.CREDIT) {
          if (dto.currency === 'USDT') {
            return BalanceTransactionType.TOP_UP;
          }
          return BalanceTransactionType.MANUAL_CREDIT;
        }
        return BalanceTransactionType.MANUAL_DEBIT;
      })();

      const comment =
        txType === BalanceTransactionType.TOP_UP
          ? (dto.note?.trim()
              ? dto.note!.trim()
              : 'Cabinet balance top-up (manual confirmation)')
          : dto.note ?? undefined;

      await this.balanceTxService.record({
        traderId,
        type: txType,
        amount: dto.amount,
        currency: dto.currency,
        referenceId: settlement.id,
        createdById: adminId,
        comment,
        tx,
      });

      this.logger.log(
        `Settlement created: ${settlement.id} | ${dto.type} ${dto.amount} ${dto.currency} | trader=${traderId} admin=${adminId}`,
      );

      return settlement;
    });
  }

  private async createPayoutSpecialistSettlement(adminId: string, dto: CreateSettlementDto) {
    const payoutTraderId = dto.payoutTraderId!;
    if (dto.currency !== 'USDT') {
      throw new BadRequestException('Pay-Out specialist settlements must use USDT');
    }

    const profile = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) {
      throw new NotFoundException(`Pay-Out specialist ${payoutTraderId} not found`);
    }

    const prismaType =
      dto.type === SettlementType.CREDIT
        ? SettlementTypeEnum.CREDIT
        : SettlementTypeEnum.DEBIT;

    const usdtId = await this.currencies.getUsdtCurrencyId();

    const settlement = await this.prisma.$transaction(async (tx) => {
      const bal = Number(
        (
          await tx.payoutTraderProfile.findUniqueOrThrow({
            where: { id: payoutTraderId },
            select: { balanceUsdt: true },
          })
        ).balanceUsdt,
      );

      if (dto.type === SettlementType.DEBIT && bal < dto.amount) {
        throw new BadRequestException(
          `Insufficient specialist USDT balance: current=${bal}, requested debit=${dto.amount}`,
        );
      }

      const delta = dto.type === SettlementType.CREDIT ? dto.amount : -dto.amount;

      await tx.payoutTraderProfile.update({
        where: { id: payoutTraderId },
        data: { balanceUsdt: { increment: delta } },
      });

      const settlementRow = await tx.settlement.create({
        data: {
          adminId,
          payoutTraderId,
          traderId: null,
          type: prismaType,
          amount: dto.amount,
          currencyId: usdtId,
          note: dto.note,
          usdtAddress: dto.usdtAddress ?? null,
        },
        include: {
          admin: { select: { email: true } },
          payoutTrader: {
            include: { user: { select: { email: true } } },
          },
        },
      });

      const ledgerType =
        dto.type === SettlementType.CREDIT
          ? PayoutTraderBalanceTxType.MANUAL_CREDIT
          : PayoutTraderBalanceTxType.SETTLEMENT_DEBIT;

      await tx.payoutTraderBalanceTransaction.create({
        data: {
          payoutTraderId,
          type: ledgerType,
          amount: dto.amount,
          currencyId: usdtId,
          referenceId: settlementRow.id,
          createdById: adminId,
          comment: dto.note ?? undefined,
        },
      });

      this.logger.log(
        `Settlement created: ${settlementRow.id} | ${dto.type} ${dto.amount} USDT | payoutSpecialist=${payoutTraderId} admin=${adminId}`,
      );

      return settlementRow;
    });

    void this.telegram
      .notifyPayoutSpecialistSettlement(payoutTraderId, {
        settlementId: settlement.id,
        amount: dto.amount,
        type: dto.type,
      })
      .catch(() => undefined);

    return settlement;
  }

  /**
   * Book a merchant fiat withdrawal agreed off-platform — debits accumulated local balance.
   *
   * RISK NOTE: irrevocable fiat debit; validates available merchant balance before commit.
   */
  private async createMerchantSettlement(adminId: string, dto: CreateSettlementDto) {
    if (dto.type !== SettlementType.DEBIT) {
      throw new BadRequestException('Merchant withdrawals are DEBIT settlements only');
    }
    const merchantId = dto.merchantId!;
    if (
      dto.manualRate === undefined ||
      dto.usdtEquivalent === undefined ||
      !dto.usdtAddress?.trim()
    ) {
      throw new BadRequestException(
        'Merchant settlement requires manualRate, usdtEquivalent, and usdtAddress (audit)',
      );
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    return this.prisma.$transaction(async (tx) => {
      const balRow = await tx.merchantBalance.findUnique({
        where: {
          merchantId_currencyId: {
            merchantId,
            currencyId,
          },
        },
      });
      const available = Number(balRow?.amount ?? 0);
      if (available < dto.amount) {
        throw new BadRequestException(
          `Insufficient merchant balance: available=${available} ${dto.currency}, requested debit=${dto.amount}`,
        );
      }

      await tx.merchantBalance.update({
        where: {
          merchantId_currencyId: {
            merchantId,
            currencyId,
          },
        },
        data: { amount: { increment: -dto.amount } },
      });

      const settlement = await tx.settlement.create({
        data: {
          adminId,
          traderId: null,
          payoutTraderId: null,
          merchantId,
          type: SettlementTypeEnum.DEBIT,
          amount: dto.amount,
          currencyId,
          manualRate: dto.manualRate,
          usdtEquivalent: dto.usdtEquivalent,
          note: dto.note,
          usdtAddress: dto.usdtAddress!.trim(),
        },
        include: {
          admin: { select: { email: true } },
          merchant: { select: { id: true, name: true } },
        },
      });

      await tx.merchantBalanceTransaction.create({
        data: {
          merchantId,
          type: MerchantBalanceTransactionType.SETTLEMENT,
          amount: dto.amount,
          currencyId,
          referenceId: settlement.id,
          comment:
            `Settlement payout ${dto.amount} ${dto.currency} @ manual ${dto.manualRate} → ${dto.usdtEquivalent} USDT` +
            (dto.note?.trim() ? ` (${dto.note.trim()})` : ''),
        },
      });

      this.logger.log(
        `Merchant settlement: ${settlement.id} debit ${dto.amount} ${dto.currency} → ${dto.usdtEquivalent} USDT | merchant=${merchantId} admin=${adminId}`,
      );

      return settlement;
    });
  }

  async listPayoutSpecialistOptions() {
    const rows = await this.prisma.payoutTraderProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        balanceUsdt: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        balance_usdt: Number(r.balanceUsdt),
        email: r.user.email,
      })),
    };
  }

  async findAll(filters: FilterSettlementsDto, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: Prisma.SettlementWhereInput = {};

    if (filters.traderId) where.traderId = filters.traderId;
    if (filters.payoutTraderId) where.payoutTraderId = filters.payoutTraderId;
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.currency) {
      const cid = await this.currencies.findCurrencyIdByCode(filters.currency);
      if (!cid) {
        return { data: [], total: 0, page, limit };
      }
      where.currencyId = cid;
    }

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

    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      if (
        filters.minAmount !== undefined &&
        filters.maxAmount !== undefined &&
        filters.minAmount > filters.maxAmount
      ) {
        throw new BadRequestException('minAmount cannot exceed maxAmount');
      }
      where.amount = {};
      if (filters.minAmount !== undefined) {
        where.amount.gte = filters.minAmount;
      }
      if (filters.maxAmount !== undefined) {
        where.amount.lte = filters.maxAmount;
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
          payoutTrader: {
            include: { user: { select: { email: true } } },
          },
          merchant: {
            select: { id: true, name: true },
          },
          currency: { select: { code: true } },
          walletDeposit: {
            select: {
              txHash: true,
              network: true,
              status: true,
            },
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
        payoutTrader: {
          include: { user: { select: { email: true } } },
        },
        merchant: {
          select: { id: true, name: true },
        },
        currency: { select: { code: true } },
        walletDeposit: {
          select: {
            txHash: true,
            network: true,
            status: true,
          },
        },
      },
    });
    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }
    return settlement;
  }

  /** Merchant cabinet: ledger settlement rows referencing off-platform payouts. */
  async findForMerchantSelf(merchantId: string, page = 1, limit = 20) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where: Prisma.SettlementWhereInput = { merchantId };

    const [data, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          manualRate: true,
          usdtEquivalent: true,
          usdtAddress: true,
          note: true,
          createdAt: true,
          admin: { select: { email: true } },
          currency: { select: { code: true } },
        },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: data.map(({ currency, ...rest }) => ({
        ...rest,
        currency: currency.code,
      })),
      total,
      page,
      limit: take,
    };
  }
}

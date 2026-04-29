import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { WalletDepositsService } from '../wallet-deposits/wallet-deposits.service';
import type { PlatformWithdrawalCreateDto } from './dto/platform-withdrawal-create.dto';
import type { WalletDepositConfirmDto } from './dto/wallet-deposit-confirm.dto';

@Injectable()
export class PlatformTreasuryService {
  private readonly logger = new Logger(PlatformTreasuryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletDeposits: WalletDepositsService,
  ) {}

  async incomeSummary(dateFrom?: Date, dateTo?: Date) {
    const where: Prisma.PlatformIncomeWhereInput = {};
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [totals, byType, byMerchant] = await Promise.all([
      this.prisma.platformIncome.aggregate({
        where,
        _sum: { incomeUsdt: true, incomeUah: true },
        _count: { _all: true },
      }),
      this.prisma.platformIncome.groupBy({
        by: ['orderType'],
        where,
        _sum: { incomeUsdt: true, incomeUah: true },
        _count: { _all: true },
      }),
      this.prisma.platformIncome.groupBy({
        by: ['merchantId'],
        where,
        _sum: { incomeUsdt: true, incomeUah: true },
        _count: { _all: true },
        orderBy: { _sum: { incomeUsdt: 'desc' } },
        take: 25,
      }),
    ]);

    const merchantIds = byMerchant.map((r) => r.merchantId);
    const merchants = merchantIds.length
      ? await this.prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = Object.fromEntries(merchants.map((m) => [m.id, m.name]));

    return {
      totalIncomeUsdt: Number(totals._sum.incomeUsdt ?? 0),
      totalIncomeUah: Number(totals._sum.incomeUah ?? 0),
      rowCount: totals._count._all,
      byOrderType: byType.map((r) => ({
        order_type: r.orderType,
        income_usdt: Number(r._sum.incomeUsdt ?? 0),
        income_uah: Number(r._sum.incomeUah ?? 0),
        count: r._count._all,
      })),
      topMerchants: byMerchant.map((r) => ({
        merchant_id: r.merchantId,
        merchant_name: nameById[r.merchantId] ?? r.merchantId,
        income_usdt: Number(r._sum.incomeUsdt ?? 0),
        income_uah: Number(r._sum.incomeUah ?? 0),
        count: r._count._all,
      })),
    };
  }

  async incomeRecent(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.platformIncome.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { name: true } },
          trader: { include: { user: { select: { email: true } } } },
        },
      }),
      this.prisma.platformIncome.count(),
    ]);
    return { data, total, page, limit };
  }

  async listWithdrawals(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.platformWithdrawal.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { initiatedBy: { select: { email: true } } },
      }),
      this.prisma.platformWithdrawal.count(),
    ]);
    return { data, total, page, limit };
  }

  async recordWithdrawal(dto: PlatformWithdrawalCreateDto, initiatedById: string) {
    return this.prisma.platformWithdrawal.create({
      data: {
        amountUsdt: dto.amount_usdt,
        coldWalletAddress: dto.cold_wallet_address,
        network: dto.network,
        txHash: dto.tx_hash,
        note: dto.note,
        initiatedById,
      },
      include: { initiatedBy: { select: { email: true } } },
    });
  }

  async listWalletDeposits(page = 1, limit = 50, traderId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.WalletDepositWhereInput = traderId ? { traderId } : {};
    const [data, total] = await Promise.all([
      this.prisma.walletDeposit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          trader: { include: { user: { select: { email: true } } } },
        },
      }),
      this.prisma.walletDeposit.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async confirmWalletDeposit(dto: WalletDepositConfirmDto, adminId: string) {
    return this.walletDeposits.confirmManual(dto, adminId);
  }

  /**
   * Block 5 §6.4 — volumes, conversion funnel, trader rate "bonus" USDT (approx), reference UAH at current P.
   */
  async operationsSummary(
    dateFrom?: Date,
    dateTo?: Date,
    currentParserUaPerUsdt?: number | null,
  ) {
    const range =
      dateFrom || dateTo
        ? {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          }
        : undefined;

    const payinWhere = range ? { createdAt: range } : {};
    const payoutWhere = range ? { createdAt: range } : {};

    const [
      payinCreated,
      payinPaid,
      payoutCreated,
      payoutCompleted,
      payinBonusRows,
      payoutBonusRows,
      incomeAgg,
    ] = await Promise.all([
      this.prisma.payinOrder.count({ where: payinWhere }),
      this.prisma.payinOrder.count({ where: { ...payinWhere, status: 'PAID' } }),
      this.prisma.payoutOrder.count({ where: payoutWhere }),
      this.prisma.payoutOrder.count({ where: { ...payoutWhere, status: 'COMPLETED' } }),
      this.prisma.payinOrder.findMany({
        where: {
          status: 'PAID',
          traderId: { not: null },
          parserRate: { not: null },
          rateTraderIn: { not: null },
          ...(range ? { updatedAt: range } : {}),
        },
        select: {
          traderId: true,
          amount: true,
          parserRate: true,
          rateTraderIn: true,
        },
      }),
      this.prisma.payoutOrder.findMany({
        where: {
          status: 'COMPLETED',
          traderId: { not: null },
          parserRate: { not: null },
          rateTraderOut: { not: null },
          ...(range ? { updatedAt: range } : {}),
        },
        select: {
          traderId: true,
          amount: true,
          parserRate: true,
          rateTraderOut: true,
        },
      }),
      this.prisma.platformIncome.aggregate({
        where: range ? { createdAt: range } : {},
        _sum: { incomeUsdt: true, incomeUah: true, orderAmountUah: true },
        _count: { _all: true },
      }),
    ]);

    const bonusByTrader = new Map<string, { payin: number; payout: number; total: number }>();

    for (const o of payinBonusRows) {
      const tid = o.traderId!;
      const amt = Number(o.amount);
      const P = Number(o.parserRate);
      const rt = Number(o.rateTraderIn);
      if (!P || !rt) continue;
      const bonus = amt / P - amt / rt;
      const cur = bonusByTrader.get(tid) ?? { payin: 0, payout: 0, total: 0 };
      cur.payin += bonus;
      cur.total += bonus;
      bonusByTrader.set(tid, cur);
    }

    for (const o of payoutBonusRows) {
      const tid = o.traderId!;
      const amt = Number(o.amount);
      const P = Number(o.parserRate);
      const rt = Number(o.rateTraderOut);
      if (!P || !rt) continue;
      const bonus = amt / rt - amt / P;
      const cur = bonusByTrader.get(tid) ?? { payin: 0, payout: 0, total: 0 };
      cur.payout += bonus;
      cur.total += bonus;
      bonusByTrader.set(tid, cur);
    }

    const traderIds = [...bonusByTrader.keys()];
    const traders = traderIds.length
      ? await this.prisma.traderProfile.findMany({
          where: { id: { in: traderIds } },
          include: { user: { select: { email: true } } },
        })
      : [];
    const emailById = Object.fromEntries(
      traders.map((t) => [t.id, t.user.email]),
    );

    const traderRateBonusUsdt = [...bonusByTrader.entries()]
      .map(([trader_id, v]) => ({
        trader_id,
        trader_email: emailById[trader_id] ?? trader_id,
        payin_bonus_usdt: v.payin,
        payout_bonus_usdt: v.payout,
        total_bonus_usdt: v.total,
      }))
      .filter((r) => Math.abs(r.total_bonus_usdt) > 1e-9)
      .sort((a, b) => b.total_bonus_usdt - a.total_bonus_usdt)
      .slice(0, 30);

    const totalOrdersFunnel = payinCreated + payoutCreated;
    const totalSuccessFunnel = payinPaid + payoutCompleted;

    const sumIncomeUsdt = Number(incomeAgg._sum.incomeUsdt ?? 0);
    const P = currentParserUaPerUsdt ?? null;
    const referenceIncomeUahAtCurrentParser =
      P !== null && Number.isFinite(P) ? sumIncomeUsdt * P : null;

    return {
      dateFrom: dateFrom?.toISOString() ?? null,
      dateTo: dateTo?.toISOString() ?? null,
      payin_orders_created: payinCreated,
      payin_orders_paid: payinPaid,
      payout_orders_created: payoutCreated,
      payout_orders_completed: payoutCompleted,
      conversion_payin_pct: payinCreated > 0 ? (payinPaid / payinCreated) * 100 : 0,
      conversion_payout_pct: payoutCreated > 0 ? (payoutCompleted / payoutCreated) * 100 : 0,
      conversion_overall_pct:
        totalOrdersFunnel > 0 ? (totalSuccessFunnel / totalOrdersFunnel) * 100 : 0,
      platform_income_rows_in_range: incomeAgg._count._all,
      turnover_uah_from_income_ledger: Number(incomeAgg._sum.orderAmountUah ?? 0),
      sum_income_usdt_in_range: sumIncomeUsdt,
      sum_income_uah_booked_in_range: Number(incomeAgg._sum.incomeUah ?? 0),
      reference_income_uah_at_current_parser: referenceIncomeUahAtCurrentParser,
      current_parser_ua_per_usdt: P,
      trader_rate_bonus_usdt: traderRateBonusUsdt,
    };
  }
}

import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeRequisiteIdentifier, RequisiteType } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CascadeService } from '../cascade/cascade.service';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import { CreateRequisiteDto } from './dto/create-requisite.dto';
import { UpdateRequisiteDto } from './dto/update-requisite.dto';

@Injectable()
export class RequisitesService {
  private readonly logger = new Logger(RequisitesService.name);

  /** Shown to traders/admins when another cabinet already uses this requisite while active. */
  static readonly DUPLICATE_ACTIVE_MESSAGE =
    'REQUISITE_ALREADY_EXISTS: This requisite already exists on the platform.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cascadeService: CascadeService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly cascadeCoverageCache: CascadeRedisStateService,
  ) {}

  /** A requisite may not remain active while its payment group is off or archived. */
  private assertGroupAllowsActivatedRequisite(group: {
    isActive: boolean;
    archivedAt: Date | null;
  }) {
    if (group.archivedAt != null) {
      throw new BadRequestException(
        'GROUP_ARCHIVED: cannot activate requisite in archived payment group',
      );
    }
    if (!group.isActive) {
      throw new BadRequestException(
        'GROUP_INACTIVE: turn the payment group on before activating this requisite',
      );
    }
  }

  private isPrismaUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }

  private async assertNoOtherActiveRequisiteWithIdentity(params: {
    type: RequisiteType;
    numberNormalized: string;
    excludeRequisiteId?: string;
  }) {
    const other = await this.prisma.requisite.findFirst({
      where: {
        type: params.type,
        numberNormalized: params.numberNormalized,
        isActive: true,
        ...(params.excludeRequisiteId
          ? { NOT: { id: params.excludeRequisiteId } }
          : {}),
      },
      select: { id: true },
    });
    if (other) {
      throw new BadRequestException(RequisitesService.DUPLICATE_ACTIVE_MESSAGE);
    }
  }

  // ─── Used by PayinService ───

  /**
   * Find and lock an available requisite for assignment.
   * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions
   * when multiple pay-in orders compete for the same requisite.
   */
  async findAvailable(currency: string, amount: number) {
    const currencyUsesBinanceParserRate = currency === 'UAH';
    let parserRate: number | undefined;
    if (currencyUsesBinanceParserRate) {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
      } catch {
        return null;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const picked = await this.cascadeService.lockBestRequisiteForPayIn(tx, {
        amount,
        currency,
        parserRate,
        enforceUsdtCapacity: currencyUsesBinanceParserRate,
      });

      if (!picked) return null;

      return tx.requisite.findUnique({
        where: { id: picked.requisiteId },
        include: { bank: true, trader: true },
      });
    });
  }

  /**
   * Atomically increment usage counters and auto-disable when limits are hit.
   * Sets `disabledReason` so traders and admins know why it was turned off.
   */
  async updateUsage(requisiteId: string, amount: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.incrementUsageInTransaction(tx, requisiteId, amount);
    });
  }

  /**
   * Increment usage inside an existing transaction (e.g. pay-in status change).
   * Mirrors {@link updateUsage} auto-disable rules.
   */
  async incrementUsageInTransaction(
    tx: Prisma.TransactionClient,
    requisiteId: string,
    amount: number,
  ): Promise<void> {
    const requisite = await tx.requisite.update({
      where: { id: requisiteId },
      data: {
        usedAmount: { increment: amount },
        usedOps: { increment: 1 },
      },
      include: { currency: { select: { code: true } } },
    });

    const amountLimitReached =
      Number(requisite.usedAmount) >= Number(requisite.limitTotalAmount);
    const txLimitReached = requisite.usedOps >= requisite.limitTotalOps;

    if (amountLimitReached || txLimitReached) {
      const reason = amountLimitReached ? 'LIMIT_AMOUNT' : 'LIMIT_TX';
      await tx.requisite.update({
        where: { id: requisiteId },
        data: { isActive: false, disabledReason: reason },
      });
      this.logger.warn(
        `Requisite ${requisiteId} auto-disabled [${reason}]: usedAmount=${requisite.usedAmount}, usedOps=${requisite.usedOps}`,
      );
    }
    void this.cascadeCoverageCache.invalidateCurrency(requisite.currency.code);
  }

  /**
   * Reverse the usage counters when an order is canceled.
   * Ensures the requisite capacity is freed for future orders.
   * Values are clamped at zero — duplicate releases must not flip counters negative.
   */
  async releaseUsage(requisiteId: string, amount: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.releaseUsageInTransaction(tx, requisiteId, amount);
    });
  }

  /**
   * Mirror of {@link releaseUsage} inside an existing transaction (e.g. maintenance jobs).
   */
  async releaseUsageInTransaction(
    tx: Prisma.TransactionClient,
    requisiteId: string,
    amount: number,
  ): Promise<void> {
    const requisite = await tx.requisite.findUnique({
      where: { id: requisiteId },
      include: { currency: { select: { code: true } } },
    });
    if (!requisite) {
      throw new NotFoundException(`Requisite ${requisiteId} not found`);
    }

    const rawNextOps = requisite.usedOps - 1;
    const rawNextAmt = Number(requisite.usedAmount) - amount;
    const nextOps = Math.max(0, rawNextOps);
    const nextAmt = Math.max(0, rawNextAmt);

    if (nextOps !== rawNextOps || nextAmt !== rawNextAmt) {
      this.logger.warn(
        `Requisite ${requisiteId}: usage release clamped at zero (usedOps=${requisite.usedOps}→${nextOps}, usedAmount=${requisite.usedAmount}→${nextAmt}, releaseAmount=${amount})`,
      );
    }

    await tx.requisite.update({
      where: { id: requisiteId },
      data: {
        usedOps: nextOps,
        usedAmount: nextAmt,
      },
    });

    void this.cascadeCoverageCache.invalidateCurrency(requisite.currency.code);
    this.logger.log(
      `Requisite ${requisiteId} usage released: amount=${amount}, ops=1`,
    );
  }

  /**
   * Check whether a requisite has exceeded its limits and disable it if so.
   * Returns true if the requisite was disabled.
   */
  async checkAndAutoDisable(requisiteId: string): Promise<boolean> {
    const requisite = await this.prisma.requisite.findUnique({
      where: { id: requisiteId },
      include: { currency: { select: { code: true } } },
    });
    if (!requisite) {
      throw new NotFoundException(`Requisite ${requisiteId} not found`);
    }

    if (!requisite.isActive) return false;

    const amountLimitReached =
      Number(requisite.usedAmount) >= Number(requisite.limitTotalAmount);
    const txLimitReached = requisite.usedOps >= requisite.limitTotalOps;

    if (amountLimitReached || txLimitReached) {
      const reason = amountLimitReached ? 'LIMIT_AMOUNT' : 'LIMIT_TX';
      await this.prisma.requisite.update({
        where: { id: requisiteId },
        data: { isActive: false, disabledReason: reason },
      });
      this.logger.warn(
        `Requisite ${requisiteId} auto-disabled [${reason}] after limit check`,
      );
      void this.cascadeCoverageCache.invalidateCurrency(requisite.currency.code);
      return true;
    }

    return false;
  }

  async create(traderId: string, dto: CreateRequisiteDto) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id: dto.groupId, traderId },
      select: {
        id: true,
        currencyId: true,
        archivedAt: true,
        isActive: true,
      },
    });
    if (!group) {
      throw new BadRequestException('GROUP_NOT_FOUND: requisite group not found');
    }
    if (group.archivedAt) {
      throw new BadRequestException('GROUP_ARCHIVED: cannot add requisite to an archived group');
    }

    const bank = await this.prisma.bank.findFirst({
      where: { id: dto.bankId, isActive: true },
    });
    if (!bank) {
      throw new BadRequestException(
        'BANK_NOT_FOUND: bank does not exist, is inactive, or was removed from the catalog',
      );
    }

    const numberNormalized = normalizeRequisiteIdentifier(dto.type, dto.number);
    if (!numberNormalized) {
      throw new BadRequestException('INVALID_REQUISITE_NUMBER: requisite number is empty');
    }

    await this.assertNoOtherActiveRequisiteWithIdentity({
      type: dto.type,
      numberNormalized,
    });

    let created;
    try {
      created = await this.prisma.requisite.create({
        data: {
          traderId,
          requisiteGroupId: group.id,
          type: dto.type as any,
          number: dto.number,
          numberNormalized,
          owner: dto.owner,
          bankId: dto.bankId,
          code: dto.code,
          acceptsOtherBanks: dto.acceptsOtherBanks ?? false,
          minAmount: dto.minAmount ?? 0,
          maxAmount: dto.maxAmount ?? 999999999,
          limitTotalAmount: dto.limitTotalAmount ?? 999999999,
          limitTotalOps: dto.limitTotalOps ?? 999999,
          currencyId: group.currencyId,
          isActive: group.isActive,
        },
        include: { bank: true, group: true, currency: { select: { code: true } } },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new BadRequestException(RequisitesService.DUPLICATE_ACTIVE_MESSAGE);
      }
      throw err;
    }
    void this.cascadeCoverageCache.invalidateCurrency(created.currency.code);
    return created;
  }

  async findByTraderId(traderId: string, includeInactive = false) {
    return this.prisma.requisite.findMany({
      where: {
        traderId,
        ...(!includeInactive ? { isActive: true } : {}),
      },
      include: { bank: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const requisite = await this.prisma.requisite.findUnique({
      where: { id },
      include: { bank: true, trader: true, group: true, currency: { select: { code: true } } },
    });
    if (!requisite) throw new NotFoundException('Requisite not found');
    return requisite;
  }

  async update(id: string, dto: UpdateRequisiteDto) {
    await this.findById(id);
    const updated = await this.prisma.requisite.update({
      where: { id },
      data: {
        ...(dto.owner !== undefined ? { owner: dto.owner } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.acceptsOtherBanks !== undefined
          ? { acceptsOtherBanks: dto.acceptsOtherBanks }
          : {}),
        ...(dto.minAmount !== undefined ? { minAmount: dto.minAmount } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount } : {}),
        ...(dto.limitTotalAmount !== undefined
          ? { limitTotalAmount: dto.limitTotalAmount }
          : {}),
        ...(dto.limitTotalOps !== undefined
          ? { limitTotalOps: dto.limitTotalOps }
          : {}),
      },
      include: { bank: true, group: true, currency: { select: { code: true } } },
    });
    void this.cascadeCoverageCache.invalidateCurrency(updated.currency.code);
    return updated;
  }

  async delete(id: string) {
    const prev = await this.findById(id);
    const removed = await this.prisma.requisite.delete({ where: { id } });
    void this.cascadeCoverageCache.invalidateCurrency(prev.currency.code);
    return removed;
  }

  async activate(id: string) {
    const prev = await this.findById(id);
    this.assertGroupAllowsActivatedRequisite(prev.group);

    await this.assertNoOtherActiveRequisiteWithIdentity({
      type: prev.type as RequisiteType,
      numberNormalized: prev.numberNormalized,
      excludeRequisiteId: id,
    });

    let updated;
    try {
      updated = await this.prisma.requisite.update({
        where: { id },
        data: { isActive: true, disabledReason: null },
        include: { bank: true, group: true },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new BadRequestException(RequisitesService.DUPLICATE_ACTIVE_MESSAGE);
      }
      throw err;
    }
    void this.cascadeCoverageCache.invalidateCurrency(prev.currency.code);
    return updated;
  }

  async deactivate(id: string) {
    const prev = await this.findById(id);
    const updated = await this.prisma.requisite.update({
      where: { id },
      data: { isActive: false, disabledReason: 'MANUAL' },
      include: { bank: true, group: true },
    });
    void this.cascadeCoverageCache.invalidateCurrency(prev.currency.code);
    return updated;
  }
}

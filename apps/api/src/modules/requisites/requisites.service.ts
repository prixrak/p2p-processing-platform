import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { CreateRequisiteDto } from './dto/create-requisite.dto';
import { UpdateRequisiteDto } from './dto/update-requisite.dto';

@Injectable()
export class RequisitesService {
  private readonly logger = new Logger(RequisitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Used by PayinService ───

  /**
   * Find and lock an available requisite for assignment.
   * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions
   * when multiple pay-in orders compete for the same requisite.
   */
  async findAvailable(currency: string, amount: number) {
    const amountDec = new Prisma.Decimal(amount);

    return this.prisma.$transaction(async (tx) => {
      const results = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r.id FROM requisites r
        INNER JOIN requisite_groups g ON g.id = r.requisite_group_id
        INNER JOIN trader_profiles tp ON tp.id = r.trader_id AND tp.is_active = true AND tp.accepting_orders = true
        WHERE r.currency = ${currency}
          AND r.is_active = true
          AND g.archived_at IS NULL
          AND g.is_active = true
          AND r.min_amount <= ${amountDec}
          AND r.max_amount >= ${amountDec}
          AND r.used_amount < r.limit_total_amount
          AND r.used_ops < r.limit_total_ops
        ORDER BY r.used_ops ASC
        LIMIT 1
        FOR UPDATE OF r SKIP LOCKED
      `;

      if (results.length === 0) return null;

      return tx.requisite.findUnique({
        where: { id: results[0].id },
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
  }

  /**
   * Reverse the usage counters when an order is canceled.
   * Ensures the requisite capacity is freed for future orders.
   */
  async releaseUsage(requisiteId: string, amount: number): Promise<void> {
    await this.prisma.requisite.update({
      where: { id: requisiteId },
      data: {
        usedAmount: { decrement: amount },
        usedOps: { decrement: 1 },
      },
    });
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
      return true;
    }

    return false;
  }

  // ─── CRUD ───

  async create(traderId: string, dto: CreateRequisiteDto) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id: dto.groupId, traderId },
    });
    if (!group) {
      throw new BadRequestException('GROUP_NOT_FOUND: requisite group not found');
    }
    if (group.archivedAt) {
      throw new BadRequestException('GROUP_ARCHIVED: cannot add requisite to an archived group');
    }

    return this.prisma.requisite.create({
      data: {
        traderId,
        requisiteGroupId: group.id,
        type: dto.type as any,
        number: dto.number,
        owner: dto.owner,
        bankId: dto.bankId,
        code: dto.code,
        acceptsOtherBanks: dto.acceptsOtherBanks ?? false,
        minAmount: dto.minAmount ?? 0,
        maxAmount: dto.maxAmount ?? 999999999,
        limitTotalAmount: dto.limitTotalAmount ?? 999999999,
        limitTotalOps: dto.limitTotalOps ?? 999999,
        currency: group.currency,
      },
      include: { bank: true, group: true },
    });
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
      include: { bank: true, trader: true, group: true },
    });
    if (!requisite) throw new NotFoundException('Requisite not found');
    return requisite;
  }

  async update(id: string, dto: UpdateRequisiteDto) {
    await this.findById(id);
    return this.prisma.requisite.update({
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
      include: { bank: true, group: true },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.requisite.delete({ where: { id } });
  }

  async activate(id: string) {
    await this.findById(id);
    return this.prisma.requisite.update({
      where: { id },
      data: { isActive: true, disabledReason: null },
      include: { bank: true, group: true },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.requisite.update({
      where: { id },
      data: { isActive: false, disabledReason: 'MANUAL' },
      include: { bank: true, group: true },
    });
  }
}

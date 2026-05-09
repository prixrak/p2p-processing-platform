import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PaymentMethodAvailability, Prisma, RequisiteDisabledReason } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { PAYIN_IN_FLIGHT_STATUSES, PayInOrderStatus } from '@p2p/shared';
import { CreateRequisiteGroupDto } from './dto/create-requisite-group.dto';
import { UpdateRequisiteGroupDto } from './dto/update-requisite-group.dto';
import { CurrenciesService } from '../currencies/currencies.service';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';

/** Clamp stored totals for API/UI so negative duplicates never leak downstream. */
function clampUsedTotals(
  usedAmountRaw: unknown,
  limitAmountRaw: unknown,
  usedOpsRaw: number,
  limitOpsRaw: number,
): { usedAmount: number; usedOps: number } {
  const limitAmt = Number(limitAmountRaw);
  const usedAmt = Math.max(0, Number(usedAmountRaw));
  const usedOps = Math.max(0, Number(usedOpsRaw));
  const limitOps = Number(limitOpsRaw);
  const usedAmount =
    Number.isFinite(limitAmt) && limitAmt > 0 ? Math.min(usedAmt, limitAmt) : usedAmt;
  const clampedOps =
    Number.isFinite(limitOps) && limitOps > 0 ? Math.min(usedOps, limitOps) : usedOps;
  return { usedAmount, usedOps: clampedOps };
}

@Injectable()
export class RequisiteGroupsService {
  private readonly logger = new Logger(RequisiteGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
    private readonly cascadeCoverageCache: CascadeRedisStateService,
  ) {}

  /** Ensures the catalog method is Pay-In capable, active, and tied to the group's fiat currency. */
  private async assertPayinPaymentMethodMatchesGroupCurrency(
    paymentMethodId: string,
    groupCurrencyId: string,
  ): Promise<void> {
    const pm = await this.prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        isActive: true,
        availability: {
          in: [PaymentMethodAvailability.PAYIN, PaymentMethodAvailability.BOTH],
        },
        country: { currencyId: groupCurrencyId },
      },
      select: { id: true },
    });
    if (!pm) {
      throw new BadRequestException(
        'PAYMENT_METHOD_INVALID: method must exist, be active, support Pay-In, and match the group currency',
      );
    }
  }

  async create(traderId: string, dto: CreateRequisiteGroupDto) {
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    await this.assertPayinPaymentMethodMatchesGroupCurrency(dto.paymentMethodId, currencyId);

    return this.prisma.requisiteGroup.create({
      data: {
        traderId,
        name: dto.name.trim(),
        currencyId,
        paymentMethodId: dto.paymentMethodId,
      },
      include: {
        paymentMethod: { select: { id: true, displayName: true, name: true } },
      },
    });
  }

  async findGroupedForTrader(
    traderId: string,
    archived: boolean,
    includeInactiveRequisites: boolean,
  ) {
    const groups = await this.prisma.requisiteGroup.findMany({
      where: {
        traderId,
        archivedAt: archived ? { not: null } : null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentMethod: { select: { id: true, displayName: true, name: true } },
        currency: { select: { code: true } },
        requisites: {
          where: includeInactiveRequisites ? {} : { isActive: true },
          include: { bank: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const requisiteIds = groups.flatMap((g) => g.requisites.map((r) => r.id));
    const volumeMap = await this.bulkVolumeBreakdown(requisiteIds);

    return groups.map((g) => ({
      ...g,
      requisites: g.requisites.map((r) => {
        const { usedAmount, usedOps } = clampUsedTotals(
          r.usedAmount,
          r.limitTotalAmount,
          r.usedOps,
          r.limitTotalOps,
        );
        return {
          ...r,
          usedAmount,
          usedOps,
          volume: volumeMap.get(r.id) ?? {
            amountInProcessing: 0,
            amountCompleted: 0,
            amountRemaining: Math.max(
              0,
              Number(r.limitTotalAmount) - usedAmount,
            ),
          },
        };
      }),
    }));
  }

  private async bulkVolumeBreakdown(
    requisiteIds: string[],
  ): Promise<
    Map<
      string,
      {
        amountInProcessing: number;
        amountCompleted: number;
        amountRemaining: number;
      }
    >
  > {
    const map = new Map<
      string,
      {
        amountInProcessing: number;
        amountCompleted: number;
        amountRemaining: number;
      }
    >();

    if (requisiteIds.length === 0) return map;

    const requisites = await this.prisma.requisite.findMany({
      where: { id: { in: requisiteIds } },
      select: {
        id: true,
        limitTotalAmount: true,
        usedAmount: true,
        limitTotalOps: true,
        usedOps: true,
      },
    });

    const limitById = new Map(
      requisites.map((r) => [r.id, Number(r.limitTotalAmount)] as const),
    );
    const usedById = new Map(
      requisites.map((r) => {
        const { usedAmount } = clampUsedTotals(
          r.usedAmount,
          r.limitTotalAmount,
          r.usedOps,
          r.limitTotalOps,
        );
        return [r.id, usedAmount] as const;
      }),
    );

    const [inFlight, paid] = await Promise.all([
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: { in: [...PAYIN_IN_FLIGHT_STATUSES] as PayInOrderStatus[] },
        },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: PayInOrderStatus.PAID,
        },
        _sum: { amount: true },
      }),
    ]);

    const inFlightById = new Map(
      inFlight
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, Number(row._sum.amount ?? 0)] as const),
    );
    const paidById = new Map(
      paid
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, Number(row._sum.amount ?? 0)] as const),
    );

    for (const id of requisiteIds) {
      const limit = limitById.get(id) ?? 0;
      const used = usedById.get(id) ?? 0;
      map.set(id, {
        amountInProcessing: inFlightById.get(id) ?? 0,
        amountCompleted: paidById.get(id) ?? 0,
        amountRemaining: Math.max(0, limit - used),
      });
    }

    return map;
  }

  async update(traderId: string, id: string, dto: UpdateRequisiteGroupDto) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id, traderId },
      include: { currency: { select: { code: true } } },
    });
    if (!group) throw new NotFoundException('Requisite group not found');

    const data: Prisma.RequisiteGroupUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.paymentMethodId !== undefined) {
      if (dto.paymentMethodId === null) {
        throw new BadRequestException('PAYMENT_METHOD_REQUIRED');
      }
      await this.assertPayinPaymentMethodMatchesGroupCurrency(
        dto.paymentMethodId,
        group.currencyId,
      );
      data.paymentMethod = { connect: { id: dto.paymentMethodId } };
    }

    if (dto.isActive === true) {
      data.isActive = true;
      data.deactivatedAt = null;
      data.archivedAt = null;
    } else if (dto.isActive === false) {
      data.isActive = false;
      data.deactivatedAt = new Date();
    }

    const include = {
      paymentMethod: { select: { id: true, displayName: true, name: true } },
    };

    /**
     * Turning a group off must persist-disable every active requisite in it (manual),
     * so turning the group back on does not resurrect payment acceptance automatically.
     * Turning a group on does not activate requisites — traders enable them individually.
     */
    if (dto.isActive === false) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.requisite.updateMany({
          where: { requisiteGroupId: id, isActive: true },
          data: { isActive: false, disabledReason: RequisiteDisabledReason.MANUAL },
        });
        return tx.requisiteGroup.update({
          where: { id },
          data,
          include,
        });
      });
      void this.cascadeCoverageCache.invalidateCurrency(group.currency.code);
      this.logger.log(
        `Deactivated requisite group id=${id} traderId=${traderId} (active requisites in group turned off)`,
      );
      return updated;
    }

    return this.prisma.requisiteGroup.update({
      where: { id },
      data,
      include,
    });
  }

  async restore(traderId: string, id: string) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id, traderId },
    });
    if (!group) throw new NotFoundException('Requisite group not found');

    return this.prisma.requisiteGroup.update({
      where: { id },
      data: {
        archivedAt: null,
        isActive: true,
        deactivatedAt: null,
      },
      include: {
        paymentMethod: { select: { id: true, displayName: true, name: true } },
      },
    });
  }

  /**
   * Soft-removes a group: deactivates all active requisites in the group (manual disable),
   * turns the group off, and moves it to the archived list immediately (no 7-day wait).
   * Requisites stay in the DB for pay-in history integrity.
   */
  async delete(traderId: string, id: string) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id, traderId },
      include: { currency: { select: { code: true } } },
    });
    if (!group) throw new NotFoundException('Requisite group not found');
    if (group.archivedAt != null) {
      throw new BadRequestException('GROUP_ALREADY_ARCHIVED');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.requisite.updateMany({
        where: { requisiteGroupId: id, isActive: true },
        data: { isActive: false, disabledReason: RequisiteDisabledReason.MANUAL },
      }),
      this.prisma.requisiteGroup.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: now,
          archivedAt: now,
        },
      }),
    ]);

    void this.cascadeCoverageCache.invalidateCurrency(group.currency.code);
    this.logger.log(
      `Archived requisite group id=${id} traderId=${traderId} (requisites in group deactivated)`,
    );
    return { ok: true };
  }
}

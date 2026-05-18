import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PaymentMethodAvailability, PayinStatus, Prisma, RequisiteDisabledReason } from '@prisma/client';
import {
  PAYIN_REQUISITE_COMPLETED_STATUSES,
  PAYIN_REQUISITE_NONCOMPLETED_STATUSES,
  type PayInOrderStatus,
} from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { CreateRequisiteGroupDto } from './dto/create-requisite-group.dto';
import { UpdateRequisiteGroupDto } from './dto/update-requisite-group.dto';
import { CurrenciesService } from '../currencies/currencies.service';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';

/**
 * Status enums match by value across the Prisma client (`PayinStatus`) and the shared API enum
 * (`PayInOrderStatus`). This adapter narrows shared readonly arrays into the Prisma enum array
 * type so we can keep a single source of truth in `@p2p/shared/payin-volume.ts`.
 */
function mapPayInStatusToPrisma(
  statuses: readonly PayInOrderStatus[],
): PayinStatus[] {
  return statuses.map((s) => s as unknown as PayinStatus);
}

/** Non-completed Pay-In rows that still reserve requisite capacity (see `@p2p/shared/payin-volume`). */
const REQUISITE_VOLUME_NONCOMPLETED: PayinStatus[] = mapPayInStatusToPrisma(
  PAYIN_REQUISITE_NONCOMPLETED_STATUSES,
);

const REQUISITE_VOLUME_COMPLETED: PayinStatus[] = mapPayInStatusToPrisma(
  PAYIN_REQUISITE_COMPLETED_STATUSES,
);

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
            amountRemaining: Math.max(0, Number(r.limitTotalAmount) - usedAmount),
            opsInProcessing: 0,
            opsCompleted: 0,
            opsRemaining: Math.max(0, Number(r.limitTotalOps) - usedOps),
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
        opsInProcessing: number;
        opsCompleted: number;
        opsRemaining: number;
      }
    >
  > {
    const map = new Map<
      string,
      {
        amountInProcessing: number;
        amountCompleted: number;
        amountRemaining: number;
        opsInProcessing: number;
        opsCompleted: number;
        opsRemaining: number;
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

    const limitAmtById = new Map(
      requisites.map((r) => [r.id, Number(r.limitTotalAmount)] as const),
    );
    const limitOpsById = new Map(
      requisites.map((r) => [r.id, Number(r.limitTotalOps)] as const),
    );
    const usedAmtById = new Map(
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
    const usedOpsById = new Map(
      requisites.map((r) => {
        const { usedOps } = clampUsedTotals(
          r.usedAmount,
          r.limitTotalAmount,
          r.usedOps,
          r.limitTotalOps,
        );
        return [r.id, usedOps] as const;
      }),
    );

    const [inFlight, paid, inFlightOps, paidOps] = await Promise.all([
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: { in: REQUISITE_VOLUME_NONCOMPLETED },
        },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: { in: REQUISITE_VOLUME_COMPLETED },
        },
        _sum: { amount: true },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: { in: REQUISITE_VOLUME_NONCOMPLETED },
        },
        _count: { _all: true },
      }),
      this.prisma.payinOrder.groupBy({
        by: ['requisiteId'],
        where: {
          requisiteId: { in: requisiteIds },
          status: { in: REQUISITE_VOLUME_COMPLETED },
        },
        _count: { _all: true },
      }),
    ]);

    const inFlightAmtById = new Map(
      inFlight
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, Number(row._sum.amount ?? 0)] as const),
    );
    const paidAmtById = new Map(
      paid
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, Number(row._sum.amount ?? 0)] as const),
    );

    const inFlightCountById = new Map(
      inFlightOps
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, row._count._all] as const),
    );
    const paidCountById = new Map(
      paidOps
        .filter((row): row is typeof row & { requisiteId: string } => row.requisiteId != null)
        .map((row) => [row.requisiteId, row._count._all] as const),
    );

    for (const id of requisiteIds) {
      const limitAmt = limitAmtById.get(id) ?? 0;
      const limitOps = limitOpsById.get(id) ?? 0;
      const completedAmt = paidAmtById.get(id) ?? 0;
      const processingAmt = inFlightAmtById.get(id) ?? 0;
      const completedOps = paidCountById.get(id) ?? 0;
      const processingOps = inFlightCountById.get(id) ?? 0;

      const clampedCompletedAmt =
        Number.isFinite(limitAmt) && limitAmt > 0
          ? Math.max(0, Math.min(completedAmt, limitAmt))
          : Math.max(0, completedAmt);
      const clampedProcessingAmt =
        Number.isFinite(limitAmt) && limitAmt > 0
          ? Math.max(0, Math.min(processingAmt, Math.max(0, limitAmt - clampedCompletedAmt)))
          : Math.max(0, processingAmt);

      const clampedCompletedOps =
        Number.isFinite(limitOps) && limitOps > 0
          ? Math.max(0, Math.min(completedOps, limitOps))
          : Math.max(0, completedOps);
      const clampedProcessingOps =
        Number.isFinite(limitOps) && limitOps > 0
          ? Math.max(0, Math.min(processingOps, Math.max(0, limitOps - clampedCompletedOps)))
          : Math.max(0, processingOps);

      const storedAmtClamped = usedAmtById.get(id) ?? 0;
      const storedOpsClamped = usedOpsById.get(id) ?? 0;

      map.set(id, {
        amountInProcessing: clampedProcessingAmt,
        amountCompleted: clampedCompletedAmt,
        amountRemaining: Math.max(
          0,
          Number.isFinite(limitAmt) && limitAmt > 0
            ? limitAmt - clampedCompletedAmt - clampedProcessingAmt
            : Math.max(0, storedAmtClamped - clampedCompletedAmt - clampedProcessingAmt),
        ),
        opsInProcessing: clampedProcessingOps,
        opsCompleted: clampedCompletedOps,
        opsRemaining: Math.max(
          0,
          Number.isFinite(limitOps) && limitOps > 0
            ? limitOps - clampedCompletedOps - clampedProcessingOps
            : Math.max(0, storedOpsClamped - clampedCompletedOps - clampedProcessingOps),
        ),
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

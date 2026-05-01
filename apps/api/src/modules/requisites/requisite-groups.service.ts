import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { PAYIN_IN_FLIGHT_STATUSES, PayInOrderStatus } from '@p2p/shared';
import { CreateRequisiteGroupDto } from './dto/create-requisite-group.dto';
import { UpdateRequisiteGroupDto } from './dto/update-requisite-group.dto';
import { CurrenciesService } from '../currencies/currencies.service';

@Injectable()
export class RequisiteGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

  async create(traderId: string, dto: CreateRequisiteGroupDto) {
    if (dto.paymentMethodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.paymentMethodId },
      });
      if (!pm) {
        throw new BadRequestException('PAYMENT_METHOD_NOT_FOUND');
      }
    }

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    return this.prisma.requisiteGroup.create({
      data: {
        traderId,
        name: dto.name.trim(),
        currencyId,
        paymentMethodId: dto.paymentMethodId ?? null,
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
      requisites: g.requisites.map((r) => ({
        ...r,
        volume: volumeMap.get(r.id) ?? {
          amountInProcessing: 0,
          amountCompleted: 0,
          amountRemaining: Math.max(
            0,
            Number(r.limitTotalAmount) - Number(r.usedAmount),
          ),
        },
      })),
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
      select: { id: true, limitTotalAmount: true, usedAmount: true },
    });

    const limitById = new Map(
      requisites.map((r) => [r.id, Number(r.limitTotalAmount)] as const),
    );
    const usedById = new Map(
      requisites.map((r) => [r.id, Number(r.usedAmount)] as const),
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
    });
    if (!group) throw new NotFoundException('Requisite group not found');

    if (dto.paymentMethodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.paymentMethodId },
      });
      if (!pm) throw new BadRequestException('PAYMENT_METHOD_NOT_FOUND');
    }

    const data: Prisma.RequisiteGroupUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.paymentMethodId !== undefined) {
      data.paymentMethod = dto.paymentMethodId
        ? { connect: { id: dto.paymentMethodId } }
        : { disconnect: true };
    }

    if (dto.isActive === true) {
      data.isActive = true;
      data.deactivatedAt = null;
      data.archivedAt = null;
    } else if (dto.isActive === false) {
      data.isActive = false;
      data.deactivatedAt = new Date();
    }

    return this.prisma.requisiteGroup.update({
      where: { id },
      data,
      include: {
        paymentMethod: { select: { id: true, displayName: true, name: true } },
      },
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

  async delete(traderId: string, id: string) {
    const group = await this.prisma.requisiteGroup.findFirst({
      where: { id, traderId },
    });
    if (!group) throw new NotFoundException('Requisite group not found');

    const count = await this.prisma.requisite.count({
      where: { requisiteGroupId: id },
    });
    if (count > 0) {
      throw new BadRequestException('GROUP_NOT_EMPTY: remove requisites before deleting the group');
    }

    await this.prisma.requisiteGroup.delete({ where: { id } });
    return { ok: true };
  }
}

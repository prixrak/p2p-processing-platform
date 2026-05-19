import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { PayinService } from '../payin/payin.service';
import { AppealStatus, UserRole } from '@p2p/shared';
import type { AppealDto } from '@p2p/shared';
import { buildAppealListSearchOr } from '../../common/order-search-where';
import { AppealFiltersDto } from './dto';

const APPEAL_INCLUDE = {
  proofs: true,
  payinOrder: {
    include: {
      currency: { select: { code: true } },
      requisite: { include: { bank: true } },
    },
  },
} as const;

export type AppealResolveActor = {
  role: string;
  traderId?: string | null;
};

type AppealWithRelations = Prisma.AppealGetPayload<{ include: typeof APPEAL_INCLUDE }>;

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payinService: PayinService,
  ) {}

  async findByOrderId(orderId: string, traderId?: string): Promise<AppealDto[]> {
    const where: Prisma.AppealWhereInput = {
      payinOrderId: orderId,
      ...(traderId ? { payinOrder: { traderId } } : {}),
    };

    const appeals = await this.prisma.appeal.findMany({
      where,
      include: APPEAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return appeals.map((a) => this.toAppealDto(a));
  }

  async findAll(filters: AppealFiltersDto, traderId?: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    let statusClause: Prisma.AppealWhereInput['status'] | undefined;

    if (filters.listBucket === 'current') {
      statusClause = AppealStatus.OPEN;
    } else if (filters.listBucket === 'history') {
      statusClause = { in: [AppealStatus.RESOLVED, AppealStatus.REJECTED] };
    } else if (filters.status) {
      statusClause = filters.status;
    }

    const where: Prisma.AppealWhereInput = {
      ...(statusClause !== undefined ? { status: statusClause } : {}),
      ...(filters.orderId ? { payinOrderId: filters.orderId } : {}),
      ...(traderId ? { payinOrder: { traderId } } : {}),
    };

    if (filters.search) {
      const searchOr = buildAppealListSearchOr(filters.search) as Prisma.AppealWhereInput[];
      if (searchOr.length > 0) {
        const prevAnd = where.AND;
        const andArr = Array.isArray(prevAnd) ? [...prevAnd] : prevAnd ? [prevAnd] : [];
        andArr.push({ OR: searchOr });
        where.AND = andArr;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        include: APPEAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return {
      items: items.map((a) => this.toAppealDto(a)),
      total,
      page,
      limit,
    };
  }

  async resolve(
    appealId: string,
    decision: AppealStatus,
    actor: AppealResolveActor,
    actualAmount?: number,
  ): Promise<AppealDto> {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: APPEAL_INCLUDE,
    });

    if (!appeal) throw new NotFoundException('Appeal not found');

    if (actor.role === UserRole.TRADER) {
      const orderTraderId = appeal.payinOrder?.traderId;
      if (!actor.traderId || orderTraderId !== actor.traderId) {
        throw new ForbiddenException(
          'You can only resolve appeals for pay-in orders assigned to you',
        );
      }
    }

    if (appeal.status !== AppealStatus.OPEN) {
      throw new BadRequestException(`Appeal is already ${appeal.status}`);
    }

    const allowedDecisions = [AppealStatus.RESOLVED, AppealStatus.REJECTED];
    if (!allowedDecisions.includes(decision)) {
      throw new BadRequestException('Decision must be RESOLVED or REJECTED');
    }

    if (actualAmount !== undefined && decision !== AppealStatus.RESOLVED) {
      throw new BadRequestException('actualAmount is only allowed when resolving an appeal');
    }

    await this.payinService.settlePayInOrderWhenAppealCloses(
      appealId,
      decision as AppealStatus.RESOLVED | AppealStatus.REJECTED,
      actualAmount,
    );

    const updated = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: APPEAL_INCLUDE,
    });
    if (!updated) throw new NotFoundException('Appeal not found after settlement');

    return this.toAppealDto(updated);
  }

  async getProofs(appealId: string, traderId?: string): Promise<string[]> {
    const where: Prisma.AppealWhereInput = {
      id: appealId,
      ...(traderId ? { payinOrder: { traderId } } : {}),
    };

    const appeal = await this.prisma.appeal.findFirst({ where });
    if (!appeal) throw new NotFoundException('Appeal not found');

    const proofs = await this.prisma.appealProof.findMany({
      where: { appealId },
    });

    return proofs.map((p) => p.fileId);
  }

  private toAppealDto(appeal: AppealWithRelations): AppealDto {
    const order = appeal.payinOrder;
    const req = order?.requisite;
    return {
      id: appeal.id,
      status: appeal.status as AppealStatus,
      created_at: Math.floor(appeal.createdAt.getTime() / 1000),
      payin_order_id: appeal.payinOrderId,
      order_amount: order ? Number(order.amount) : 0,
      currency: order ? order.currency.code : '',
      paid_amount: Number(appeal.paidAmount),
      requisite_number: req?.number ?? '',
      requisite_owner: req?.owner ?? '',
      requisite_card_holder_name: req?.cardHolderName ?? '',
      bank: req?.bank?.name ?? '',
      proofs_of_payment: (appeal.proofs ?? []).map((p) => p.fileId),
    };
  }
}

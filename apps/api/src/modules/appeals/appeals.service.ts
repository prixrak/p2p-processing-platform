import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AppealStatus } from '@p2p/shared';
import type { AppealDto } from '@p2p/shared';
import { AppealFiltersDto } from './dto';

const APPEAL_INCLUDE = {
  proofs: true,
  payinOrder: true,
} as const;

type AppealWithRelations = Prisma.AppealGetPayload<{ include: typeof APPEAL_INCLUDE }>;

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const where: Prisma.AppealWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.orderId ? { payinOrderId: filters.orderId } : {}),
      ...(traderId ? { payinOrder: { traderId } } : {}),
    };

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

  async resolve(appealId: string, decision: AppealStatus): Promise<AppealDto> {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: APPEAL_INCLUDE,
    });

    if (!appeal) throw new NotFoundException('Appeal not found');

    if (appeal.status !== AppealStatus.OPEN) {
      throw new BadRequestException(`Appeal is already ${appeal.status}`);
    }

    const allowedDecisions = [AppealStatus.RESOLVED, AppealStatus.REJECTED];
    if (!allowedDecisions.includes(decision)) {
      throw new BadRequestException('Decision must be RESOLVED or REJECTED');
    }

    const updated = await this.prisma.appeal.update({
      where: { id: appealId },
      data: { status: decision },
      include: APPEAL_INCLUDE,
    });

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
    return {
      id: appeal.id,
      status: appeal.status as AppealStatus,
      created_at: Math.floor(appeal.createdAt.getTime() / 1000),
      paid_amount: Number(appeal.paidAmount),
      proofs_of_payment: (appeal.proofs ?? []).map((p) => p.fileId),
    };
  }
}

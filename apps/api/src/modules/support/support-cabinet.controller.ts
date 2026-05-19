import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AppealStatusEnum } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, DirectionType } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { PayinService } from '../payin/payin.service';
import { PayoutService } from '../payout/payout.service';
import { payinOrderListRequisiteFields } from '../../common/payin-order-list-requisite-fields';
import { buildAppealPayinOrderSearchOr } from '../../common/order-search-where';

@ApiTags('Support Cabinet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPPORT, UserRole.ADMIN, UserRole.OWNER)
@Controller('support')
export class SupportCabinetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payinService: PayinService,
    private readonly payoutService: PayoutService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'List orders (read-only for support)' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'merchant', required: false })
  @ApiQuery({ name: 'trader', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getOrders(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('merchant') merchant?: string,
    @Query('trader') trader?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const take = limit ?? 20;
    const skip = ((page ?? 1) - 1) * take;
    const isPayout = type === DirectionType.PAYOUT;

    if (isPayout) {
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (merchant) {
        where.merchant = { name: { contains: merchant, mode: 'insensitive' } };
      }
      if (trader) {
        where.trader = { user: { email: { contains: trader, mode: 'insensitive' } } };
      }

      const [orders, total] = await Promise.all([
        this.prisma.payoutOrder.findMany({
          where,
          include: {
            merchant: { select: { name: true } },
            trader: { include: { user: { select: { email: true } } } },
            currency: { select: { code: true } },
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        this.prisma.payoutOrder.count({ where }),
      ]);

      return {
        data: orders.map((o) => ({
          id: o.id,
          type: DirectionType.PAYOUT,
          merchantName: o.merchant?.name ?? '—',
          traderName: o.trader?.user?.email ?? '',
          amount: Number(o.amount),
          currency: o.currency.code,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
        })),
        total,
        page: page ?? 1,
        totalPages: Math.max(1, Math.ceil(total / take)),
      };
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (merchant) {
      where.merchant = { name: { contains: merchant, mode: 'insensitive' } };
    }
    if (trader) {
      where.trader = { user: { email: { contains: trader, mode: 'insensitive' } } };
    }

    const [orders, total] = await Promise.all([
      this.prisma.payinOrder.findMany({
        where,
        include: {
          merchant: { select: { name: true } },
          trader: { include: { user: { select: { email: true } } } },
          currency: { select: { code: true } },
          requisite: {
            select: {
              id: true,
              type: true,
              number: true,
              owner: true,
              cardHolderName: true,
              code: true,
              bank: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.payinOrder.count({ where }),
    ]);

    return {
      data: orders.map((o) => ({
        id: o.id,
        type: DirectionType.PAYIN,
        merchantName: o.merchant?.name ?? '—',
        traderName: o.trader?.user?.email ?? '',
        amount: Number(o.amount),
        currency: o.currency.code,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        ...payinOrderListRequisiteFields(o.traderProcessingMethod, o.requisite),
      })),
      total,
      page: page ?? 1,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  @Get('orders/:id/status-history')
  @ApiOperation({ summary: 'Status change timeline for a Pay-In or Pay-Out order' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  async getOrderStatusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: string,
  ) {
    const isPayin = !type || type.toUpperCase() !== DirectionType.PAYOUT;
    const items = isPayin
      ? await this.payinService.getPayinOrderStatusHistory(id)
      : await this.payoutService.getPayoutOrderStatusHistory(id);

    return {
      items: items.map((e) => ({
        status: e.status,
        timestamp: e.timestamp.toISOString(),
        actor: e.actor,
        note: e.note ?? null,
      })),
    };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order details' })
  async getOrderDetails(@Param('id', ParseUUIDPipe) id: string) {
    const payinOrder = await this.prisma.payinOrder.findUnique({
      where: { id },
      include: {
        merchant: { select: { name: true } },
        trader: { include: { user: { select: { email: true } } } },
        requisite: {
          include: { bank: { select: { name: true } } },
        },
        currency: { select: { code: true } },
        forkChatProofs: { select: { fileId: true } },
      },
    });

    if (payinOrder) {
      return {
        id: payinOrder.id,
        type: DirectionType.PAYIN,
        merchantName: payinOrder.merchant?.name ?? '—',
        traderName: payinOrder.trader?.user?.email ?? '',
        amount: Number(payinOrder.amount),
        currency: payinOrder.currency.code,
        status: payinOrder.status,
        createdAt: payinOrder.createdAt.toISOString(),
        updatedAt: payinOrder.updatedAt.toISOString(),
        traderProcessingMethod: payinOrder.traderProcessingMethod ?? null,
        forkExchangeReference: payinOrder.forkExchangeReference ?? null,
        forkChatProofFileIds: payinOrder.forkChatProofs.map((p) => p.fileId),
        requisites: payinOrder.requisite
          ? {
              bank: payinOrder.requisite.bank?.name ?? '—',
              cardNumber: payinOrder.requisite.number ?? '',
            }
          : undefined,
        statusHistory: (await this.payinService.getPayinOrderStatusHistory(id)).map((e) => ({
          status: e.status,
          timestamp: e.timestamp.toISOString(),
          actor: e.actor,
          note: e.note ?? null,
        })),
      };
    }

    const payoutOrder = await this.prisma.payoutOrder.findUnique({
      where: { id },
      include: {
        merchant: { select: { name: true } },
        trader: { include: { user: { select: { email: true } } } },
        currency: { select: { code: true } },
      },
    });

    if (payoutOrder) {
      return {
        id: payoutOrder.id,
        type: DirectionType.PAYOUT,
        merchantName: payoutOrder.merchant?.name ?? '—',
        traderName: payoutOrder.trader?.user?.email ?? '',
        amount: Number(payoutOrder.amount),
        currency: payoutOrder.currency.code,
        status: payoutOrder.status,
        createdAt: payoutOrder.createdAt.toISOString(),
        updatedAt: payoutOrder.updatedAt.toISOString(),
        statusHistory: (await this.payoutService.getPayoutOrderStatusHistory(id)).map((e) => ({
          status: e.status,
          timestamp: e.timestamp.toISOString(),
          actor: e.actor,
          note: e.note ?? null,
        })),
      };
    }

    throw new NotFoundException(`Order ${id} not found`);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'List disputes (appeals)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getDisputes(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const take = limit ?? 20;
    const skip = ((page ?? 1) - 1) * take;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = buildAppealPayinOrderSearchOr(search);
    }

    const [appeals, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        include: {
          payinOrder: {
            include: {
              merchant: { select: { name: true } },
              trader: { include: { user: { select: { email: true } } } },
              currency: { select: { code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return {
      data: appeals.map((a) => ({
        id: a.id,
        orderId: a.payinOrderId,
        orderType: DirectionType.PAYIN,
        merchantName: a.payinOrder?.merchant?.name ?? '—',
        traderName: a.payinOrder?.trader?.user?.email ?? '',
        amount: Number(a.payinOrder?.amount ?? 0),
        currency: a.payinOrder?.currency.code ?? '',
        reason: `Paid amount discrepancy: ${Number(a.paidAmount)}`,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page: page ?? 1,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'Get dispute details' })
  async getDisputeDetails(@Param('id', ParseUUIDPipe) id: string) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        payinOrder: {
          include: {
            merchant: { select: { name: true } },
            trader: { include: { user: { select: { email: true } } } },
            currency: { select: { code: true } },
          },
        },
        proofs: {
          include: { file: true },
        },
      },
    });

    if (!appeal) throw new NotFoundException(`Dispute ${id} not found`);

    return {
      id: appeal.id,
      orderId: appeal.payinOrderId,
      orderType: DirectionType.PAYIN,
      merchantName: appeal.payinOrder?.merchant?.name ?? '—',
      traderName: appeal.payinOrder?.trader?.user?.email ?? '',
      amount: Number(appeal.payinOrder?.amount ?? 0),
      currency: appeal.payinOrder?.currency.code ?? '',
      reason: `Paid amount discrepancy: ${Number(appeal.paidAmount)}`,
      status: appeal.status,
      createdAt: appeal.createdAt.toISOString(),
      proofFiles: appeal.proofs.map((p) => ({
        id: p.file.id,
        name: p.file.originalName,
        url: `/api/files/${p.file.id}`,
      })),
      notes: [],
    };
  }

  @Patch('disputes/:id')
  @ApiOperation({ summary: 'Update dispute status' })
  async updateDisputeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') newStatus: string,
  ) {
    const appeal = await this.prisma.appeal.findUnique({ where: { id } });
    if (!appeal) throw new NotFoundException(`Dispute ${id} not found`);

    const statusMap: Record<string, AppealStatusEnum> = {
      OPEN: AppealStatusEnum.OPEN,
      IN_PROGRESS: AppealStatusEnum.OPEN,
      RESOLVED: AppealStatusEnum.RESOLVED,
      CLOSED: AppealStatusEnum.REJECTED,
    };

    return this.prisma.appeal.update({
      where: { id },
      data: { status: statusMap[newStatus] ?? AppealStatusEnum.OPEN },
    });
  }

  @Post('disputes/:id/notes')
  @ApiOperation({ summary: 'Add a note to a dispute (in-memory placeholder)' })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @CurrentUser('email') authorEmail: string,
  ) {
    const appeal = await this.prisma.appeal.findUnique({ where: { id } });
    if (!appeal) throw new NotFoundException(`Dispute ${id} not found`);

    return {
      id: crypto.randomUUID(),
      author: authorEmail,
      content,
      createdAt: new Date().toISOString(),
    };
  }

  @Get('balances/:type')
  @ApiOperation({ summary: 'List trader or merchant balances' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getBalances(
    @Param('type') type: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const take = limit ?? 20;
    const skip = ((page ?? 1) - 1) * take;

    if (type === 'merchants') {
      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [merchants, total] = await Promise.all([
        this.prisma.merchant.findMany({
          where,
          include: {
            balances: { include: { currency: { select: { code: true } } } },
            user: { select: { email: true, isActive: true } },
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        this.prisma.merchant.count({ where }),
      ]);

      const data = merchants.flatMap((m) =>
        m.balances.length > 0
          ? m.balances.map((b) => ({
              id: `${m.id}-${b.currency.code}`,
              name: m.name,
              email: m.user?.email ?? '',
              balance: Number(b.amount),
              frozenBalance: 0,
              currency: b.currency.code,
              status: m.isLock ? 'locked' : 'active',
            }))
          : [{
              id: m.id,
              name: m.name,
              email: m.user?.email ?? '',
              balance: 0,
              frozenBalance: 0,
              currency: '—',
              status: m.isLock ? 'locked' : 'active',
            }],
      );

      return {
        data,
        total,
        page: page ?? 1,
        totalPages: Math.max(1, Math.ceil(total / take)),
      };
    }

    const where: Record<string, unknown> = {};
    if (search) {
      where.user = { email: { contains: search, mode: 'insensitive' } };
    }

    const [traders, total] = await Promise.all([
      this.prisma.traderProfile.findMany({
        where,
        include: {
          user: { select: { email: true, isActive: true } },
          balances: { include: { currency: { select: { code: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.traderProfile.count({ where }),
    ]);

    const data = traders.flatMap((t) =>
      t.balances.length > 0
        ? t.balances.map((b) => ({
            id: `${t.id}-${b.currency.code}`,
            name: t.user?.email ?? '',
            email: t.user?.email ?? '',
            balance: Number(b.amount),
            frozenBalance: 0,
            currency: b.currency.code,
            status: t.user?.isActive ? 'active' : 'inactive',
          }))
        : [{
            id: t.id,
            name: t.user?.email ?? '',
            email: t.user?.email ?? '',
            balance: 0,
            frozenBalance: 0,
            currency: '—',
            status: t.user?.isActive ? 'active' : 'inactive',
          }],
    );

    return {
      data,
      total,
      page: page ?? 1,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }
}

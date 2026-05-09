import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  NotFoundException,
  Logger,
  Sse,
  Header,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  UserRole,
  PayOutOrderStatus,
  isValidPayOutTransition,
  WebhookMethod,
  DirectionType,
  ORDER_LIST_DIRECTION,
} from '@p2p/shared';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable, merge } from 'rxjs';
import { PrismaService } from '../../config/prisma.service';
import { PayinService } from '../payin/payin.service';
import { PayinRealtimeService } from '../payin/payin-realtime.service';
import { PayoutRealtimeService } from '../payout/payout-realtime.service';
import { IsString } from 'class-validator';
import { buildPayinPayoutOrderSearchOr } from '../../common/order-search-where';

class UpdateOrderStatusDto {
  @IsString()
  status: string;
}

@ApiTags('Admin Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('admin/orders')
export class AdminOrdersController {
  private readonly logger = new Logger(AdminOrdersController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payinService: PayinService,
    private readonly payinRealtime: PayinRealtimeService,
    private readonly payoutRealtime: PayoutRealtimeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all orders (payin or payout) with filters' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'merchant', required: false })
  @ApiQuery({ name: 'trader', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('type') type?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('merchant') merchantFilter?: string,
    @Query('trader') traderFilter?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const orderType = type ?? direction;
    const isPayin =
      !orderType ||
      orderType.toUpperCase() === DirectionType.PAYIN ||
      orderType === ORDER_LIST_DIRECTION.PAY_IN;

    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    if (isPayin) {
      const where: Record<string, unknown> = {};
      if (status) where.status = status.toUpperCase();
      if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
      if (search) {
        where.OR = buildPayinPayoutOrderSearchOr(search, { merchantNameContains: true });
      }
      if (merchantFilter) {
        where.merchant = { name: { contains: merchantFilter, mode: 'insensitive' } };
      }
      if (traderFilter) {
        where.trader = {
          user: { email: { contains: traderFilter, mode: 'insensitive' } },
        };
      }

      const [orders, total] = await Promise.all([
        this.prisma.payinOrder.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
            currency: { select: { code: true } },
          },
        }),
        this.prisma.payinOrder.count({ where }),
      ]);

      return {
        data: orders.map((o) => ({
          id: o.id,
          type: DirectionType.PAYIN,
          externalId: o.requestId,
          merchantName: o.merchant.name,
          traderName: o.trader?.user?.email ?? null,
          amount: Number(o.amount),
          currency: o.currency.code,
          status: o.status,
          paymentMethod: null,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    } else {
      const where: Record<string, unknown> = {};
      if (status) where.status = status.toUpperCase();
      if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
      if (search) {
        where.OR = buildPayinPayoutOrderSearchOr(search, { merchantNameContains: true });
      }
      if (merchantFilter) {
        where.merchant = { name: { contains: merchantFilter, mode: 'insensitive' } };
      }
      if (traderFilter) {
        where.trader = {
          user: { email: { contains: traderFilter, mode: 'insensitive' } },
        };
      }

      const [orders, total] = await Promise.all([
        this.prisma.payoutOrder.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
            currency: { select: { code: true } },
          },
        }),
        this.prisma.payoutOrder.count({ where }),
      ]);

      return {
        data: orders.map((o) => ({
          id: o.id,
          type: DirectionType.PAYOUT,
          externalId: o.requestId,
          merchantName: o.merchant.name,
          traderName: o.trader?.user?.email ?? null,
          amount: Number(o.amount),
          currency: o.currency.code,
          status: o.status,
          paymentMethod: null,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }
  }

  /** Support listens on `/api/admin/orders/stream`; same RBAC envelope as merchant/trader SSE. */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @SkipThrottle()
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: 'SSE stream for Pay-In and Pay-Out order lifecycle (staff consoles)' })
  @ApiProduces('text/event-stream')
  streamStaffOrderEvents(): Observable<MessageEvent> {
    return merge(
      this.payinRealtime.streamForStaffCabinet(),
      this.payoutRealtime.streamForStaffCabinet(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by ID (payin or payout)' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: string,
  ) {
    const isPayin = !type || type.toUpperCase() !== DirectionType.PAYOUT;

    if (isPayin) {
      const order = await this.prisma.payinOrder.findUnique({
        where: { id },
        include: {
          merchant: { select: { name: true } },
          trader: { select: { user: { select: { email: true } } } },
          requisite: { include: { bank: { select: { name: true } } } },
          currency: { select: { code: true } },
          forkChatProofs: { select: { fileId: true } },
        },
      });

      if (!order) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({
          where: { id },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
            currency: { select: { code: true } },
          },
        });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        return this.formatPayoutDetail(payoutOrder);
      }

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      });

      return {
        id: order.id,
        type: DirectionType.PAYIN,
        externalId: order.requestId,
        merchantName: order.merchant.name,
        traderName: order.trader?.user?.email ?? null,
        amount: Number(order.amount),
        currency: order.currency.code,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        traderProcessingMethod: order.traderProcessingMethod ?? null,
        forkExchangeReference: order.forkExchangeReference ?? null,
        forkChatProofFileIds: order.forkChatProofs.map((p) => p.fileId),
        requisites: order.requisite
          ? {
              bank: order.requisite.bank?.name ?? null,
              cardNumber: order.requisite.number,
            }
          : null,
        statusHistory: auditLogs.map((l) => ({
          status: l.action,
          timestamp: l.createdAt,
          actor: l.actor?.email ?? 'system',
        })),
      };
    } else {
      const order = await this.prisma.payoutOrder.findUnique({
        where: { id },
        include: {
          merchant: { select: { name: true } },
          trader: { select: { user: { select: { email: true } } } },
          currency: { select: { code: true } },
        },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      });

      return {
        ...this.formatPayoutDetail(order),
        statusHistory: auditLogs.map((l) => ({
          status: l.action,
          timestamp: l.createdAt,
          actor: l.actor?.email ?? 'system',
        })),
      };
    }
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (admin override with state-machine validation)' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Query('type') type?: string,
  ) {
    if (!dto.status) throw new BadRequestException('status is required');
    const targetStatus = dto.status.toUpperCase();
    const isPayin = !type || type.toUpperCase() !== DirectionType.PAYOUT;

    if (isPayin) {
      const order = await this.prisma.payinOrder.findUnique({ where: { id } });

      if (!order) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({ where: { id } });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        return this.updatePayoutStatus(payoutOrder, targetStatus);
      }

      return this.payinService.adminUpdatePayinOrderStatus(id, targetStatus);
    } else {
      const order = await this.prisma.payoutOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      return this.updatePayoutStatus(order, targetStatus);
    }
  }

  private async updatePayoutStatus(order: { id: string; status: string; callbackUrl: string | null; requestId: string; amount: any }, targetStatus: string) {
    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, targetStatus as PayOutOrderStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${targetStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payoutOrder.update({
        where: { id: order.id },
        data: { status: targetStatus as never },
      });

      if (updated.callbackUrl) {
        await tx.webhookOutbox.create({
          data: {
            payoutOrderId: updated.id,
            method: WebhookMethod.PAYOUT_UPDATE_STATUS_ORDER as any,
            payloadJson: {
              id: updated.id,
              order_id: updated.requestId,
              order_status: updated.status,
              amount: Number(updated.amount),
            },
            callbackUrl: updated.callbackUrl,
          },
        });
      }

      this.logger.log(`Admin updated pay-out order ${order.id}: ${order.status} -> ${targetStatus}`);
      return updated;
    });
  }

  private formatPayoutDetail(order: {
    id: string;
    requestId: string;
    merchant: { name: string };
    trader?: { user: { email: string } } | null;
    amount: unknown;
    currency: { code: string };
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      type: DirectionType.PAYOUT,
      externalId: order.requestId,
      merchantName: order.merchant.name,
      traderName: order.trader?.user?.email ?? null,
      amount: Number(order.amount),
      currency: order.currency.code,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      requisites: null,
      statusHistory: [],
    };
  }
}

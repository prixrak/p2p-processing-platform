import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
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
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  UserRole,
  PayOutOrderStatus,
  PayInOrderStatus,
  ApplicationLogUiStatus,
  AuditAction,
  AuditEntityType,
  isValidPayOutTransition,
  WebhookMethod,
  DirectionType,
  ORDER_LIST_DIRECTION,
  mapPayinToApplicationLogUiStatus,
  mapPayoutToApplicationLogUiStatus,
  applicationLogErrorMessage,
  resolvePayinApplicationLogErrorCode,
  resolvePayoutApplicationLogErrorCode,
} from '@p2p/shared';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable, merge } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { PayinService } from '../payin/payin.service';
import { PayoutService } from '../payout/payout.service';
import { PayinRealtimeService } from '../payin/payin-realtime.service';
import { PayoutRealtimeService } from '../payout/payout-realtime.service';
import { AuditService } from '../audit/audit.service';
import { IsString } from 'class-validator';
import { buildPayinOrderSearchOr, buildPayoutOrderSearchOr } from '../../common/order-search-where';
import { mapAuditRowToAdminStatusHistory } from './admin-order-status-audit-history';
import { payinOrderListRequisiteFields } from '../../common/payin-order-list-requisite-fields';

const PAYOUT_ADMIN_ORDER_INCLUDE = {
  merchant: { select: { id: true, name: true } },
  trader: { select: { id: true, user: { select: { email: true } } } },
  payoutTrader: { select: { user: { select: { email: true } } } },
  currency: { select: { code: true } },
  paymentMethod: { select: { displayName: true } },
} as const;

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
    private readonly payoutService: PayoutService,
    private readonly payinRealtime: PayinRealtimeService,
    private readonly payoutRealtime: PayoutRealtimeService,
    private readonly audit: AuditService,
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
        where.OR = buildPayinOrderSearchOr(search, { merchantNameContains: true });
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
          ...payinOrderListRequisiteFields(o.traderProcessingMethod, o.requisite),
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
        where.OR = buildPayoutOrderSearchOr(search, { merchantNameContains: true });
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

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Status change timeline for a Pay-In or Pay-Out order' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  async getStatusHistory(
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
          merchant: { select: { id: true, name: true } },
          trader: { select: { id: true, user: { select: { email: true } } } },
          requisite: {
            include: {
              bank: { select: { name: true } },
              group: {
                include: {
                  paymentMethod: { select: { displayName: true } },
                },
              },
            },
          },
          currency: { select: { code: true } },
          forkChatProofs: { select: { fileId: true } },
        },
      });

      if (!order) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({
          where: { id },
          include: PAYOUT_ADMIN_ORDER_INCLUDE,
        });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        const auditLogsFb = await this.prisma.auditLog.findMany({
          where: { entityId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            action: true,
            createdAt: true,
            actorRole: true,
            actor: { select: { email: true, role: true } },
            oldValue: true,
            newValue: true,
          },
        });
        return this.buildPayoutAdminDetail(payoutOrder, auditLogsFb);
      }

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actorRole: true,
          actor: { select: { email: true, role: true } },
          oldValue: true,
          newValue: true,
        },
      });

      const uiStatus = mapPayinToApplicationLogUiStatus(
        order.status as PayInOrderStatus,
        order.traderId,
      );
      const hideAssignmentSections = uiStatus === ApplicationLogUiStatus.PENDING;
      const payinErrorCode = resolvePayinApplicationLogErrorCode(
        order.status as PayInOrderStatus,
        order.noRequisiteReason,
      );

      return {
        id: order.id,
        type: DirectionType.PAYIN,
        externalId: order.requestId,
        merchantId: order.merchantId,
        merchantName: order.merchant.name,
        traderName: order.trader?.user?.email ?? null,
        traderId: order.traderId,
        amount: Number(order.amount),
        currency: order.currency.code,
        status: order.status,
        applicationLogUiStatus: uiStatus,
        partnerIp: order.partnerIp ?? null,
        externalApiPath: order.externalApiPath ?? null,
        commissionPercent: Number(order.commissionPercent),
        commission: Number(order.commission),
        partnerAmount: Number(order.partnerAmount),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        confirmedAt: order.confirmedAt,
        completedAt: order.completedAt,
        autocloseAt: order.autocloseAt,
        traderProcessingMethod: order.traderProcessingMethod ?? null,
        forkExchangeReference: order.forkExchangeReference ?? null,
        forkChatProofFileIds: order.forkChatProofs.map((p) => p.fileId),
        paymentDetails:
          hideAssignmentSections || !order.requisite
            ? null
            : {
                requisiteType: order.requisite.type,
                paymentMethodLabel:
                  order.requisite.group.paymentMethod.displayName ?? order.requisite.type,
                number: order.requisite.number,
                owner: order.requisite.owner,
                cardHolderName: order.requisite.cardHolderName ?? '',
                bankName: order.requisite.bank?.name ?? null,
                requisiteId: order.requisite.id,
              },
        stakeholderAmounts: hideAssignmentSections
          ? null
          : {
              partner: {
                label: order.merchant.name,
                userId: order.merchantId,
                percent: Number(order.commissionPercent),
                amountLocal: Number(order.partnerAmount),
              },
              trader: order.trader
                ? {
                    label: order.trader.user.email,
                    userId: order.trader.id,
                    percent: null,
                    amountLocal: null,
                  }
                : null,
              platform: {
                label: 'Platform',
                userId: null,
                percent: Number(order.commissionPercent),
                amountLocal: Number(order.commission),
              },
            },
        applicationLogError:
          uiStatus === ApplicationLogUiStatus.ERROR && payinErrorCode
            ? {
                code: payinErrorCode,
                message: applicationLogErrorMessage(
                  'PAYIN',
                  order.status as PayInOrderStatus,
                  undefined,
                  order.noRequisiteReason,
                ),
                detail: order.noRequisiteDetail ?? null,
                at: order.completedAt?.toISOString() ?? order.updatedAt.toISOString(),
              }
            : null,
        applicationLogHideAssignmentSections: hideAssignmentSections,
        requisites: order.requisite
          ? {
              bank: order.requisite.bank?.name ?? null,
              cardNumber: order.requisite.number,
            }
          : null,
        statusHistory: auditLogs.map((l) => mapAuditRowToAdminStatusHistory(l)),
      };
    } else {
      const order = await this.prisma.payoutOrder.findUnique({
        where: { id },
        include: PAYOUT_ADMIN_ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actorRole: true,
          actor: { select: { email: true, role: true } },
          oldValue: true,
          newValue: true,
        },
      });

      return this.buildPayoutAdminDetail(order, auditLogs);
    }
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (admin override with state-machine validation)' })
  @ApiQuery({ name: 'type', required: false, enum: DirectionType })
  async updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Query('type') type?: string,
  ) {
    if (!dto.status) throw new BadRequestException('status is required');
    const targetStatus = dto.status.toUpperCase();
    const isPayin = !type || type.toUpperCase() !== DirectionType.PAYOUT;

    if (isPayin) {
      const payinProbe = await this.prisma.payinOrder.findUnique({ where: { id } });

      if (!payinProbe) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({ where: { id } });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        const prev = payoutOrder.status;
        const updated = await this.updatePayoutStatus(payoutOrder, targetStatus);
        void this.safeAdminOrderStatusAudit(req, AuditEntityType.PayoutOrder, id, prev, updated.status);
        return updated;
      }

      const prev = payinProbe.status;
      const updated = await this.payinService.adminUpdatePayinOrderStatus(id, targetStatus);
      void this.safeAdminOrderStatusAudit(req, AuditEntityType.PayinOrder, id, prev, updated.status);
      return updated;
    }

    const payoutProbe = await this.prisma.payoutOrder.findUnique({ where: { id } });
    if (!payoutProbe) throw new NotFoundException(`Order ${id} not found`);
    const prev = payoutProbe.status;
    const updated = await this.updatePayoutStatus(payoutProbe, targetStatus);
    void this.safeAdminOrderStatusAudit(req, AuditEntityType.PayoutOrder, id, prev, updated.status);
    return updated;
  }

  /**
   * Best-effort audit after a validated admin manual status transition (`ORDER_STATUS_CHANGED`).
   * Does not block PATCH success.
   */
  private safeAdminOrderStatusAudit(
    req: Request,
    entityType: string,
    entityId: string,
    previousStatus: string,
    nextStatus: string,
  ): void {
    const user = req.user as { id: string; role: string } | undefined;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    void this.audit
      .log({
        actorId: user?.id ?? null,
        actorRole: user?.role ?? null,
        action: AuditAction.ORDER_STATUS_CHANGED,
        entityType,
        entityId,
        oldValue: { status: previousStatus },
        newValue: { status: nextStatus },
        ip,
      })
      .catch(() => undefined);
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

  private buildPayoutAdminDetail(
    order: Prisma.PayoutOrderGetPayload<{ include: typeof PAYOUT_ADMIN_ORDER_INCLUDE }>,
    auditLogs: Array<{
      action: string;
      createdAt: Date;
      actorRole: string | null;
      actor: { email: string; role: string | null } | null;
      oldValue: unknown;
      newValue: unknown;
    }>,
  ) {
    const uiStatus = mapPayoutToApplicationLogUiStatus(order.status as PayOutOrderStatus);
    const hideAssignmentSections = uiStatus === ApplicationLogUiStatus.PENDING;
    const payoutErrorCode = resolvePayoutApplicationLogErrorCode(
      order.status as PayOutOrderStatus,
      order.traderRejectReason,
    );

    const traderLabel =
      order.trader?.user.email ?? order.payoutTrader?.user.email ?? null;

    return {
      id: order.id,
      type: DirectionType.PAYOUT,
      externalId: order.requestId,
      merchantId: order.merchantId,
      merchantName: order.merchant.name,
      traderName: traderLabel,
      traderId: order.traderId,
      payoutTraderEmail: order.payoutTrader?.user.email ?? null,
      amount: Number(order.amount),
      currency: order.currency.code,
      status: order.status,
      applicationLogUiStatus: uiStatus,
      partnerIp: order.partnerIp ?? null,
      externalApiPath: order.externalApiPath ?? null,
      partnerAmount: Number(order.partnerAmount),
      commissionAmount: Number(order.commissionAmount),
      percentFee: Number(order.percentFee),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      startAt: order.startAt,
      endAt: order.endAt,
      paymentDetails: hideAssignmentSections
        ? null
        : {
            requisiteType: order.detailsType,
            paymentMethodLabel: order.paymentMethod?.displayName ?? order.detailsType,
            number: order.detailsNumber,
            owner: order.detailsOwner ?? null,
            bankName: order.paymentMethod?.displayName ?? null,
            requisiteId: null as string | null,
          },
      stakeholderAmounts: hideAssignmentSections
        ? null
        : {
            partner: {
              label: order.merchant.name,
              userId: order.merchantId,
              percent: Number(order.percentFee),
              amountLocal: Number(order.partnerAmount),
            },
            trader: order.trader
              ? {
                  label: order.trader.user.email,
                  userId: order.trader.id,
                  percent: null as number | null,
                  amountLocal: null as number | null,
                }
              : order.payoutTrader
                ? {
                    label: order.payoutTrader.user.email,
                    userId: null as string | null,
                    percent: null as number | null,
                    amountLocal: null as number | null,
                  }
                : null,
            platform: {
              label: 'Platform',
              userId: null as string | null,
              percent: Number(order.percentFee),
              amountLocal: Number(order.commissionAmount),
            },
          },
      applicationLogError:
        uiStatus === ApplicationLogUiStatus.ERROR && payoutErrorCode
          ? {
              code: payoutErrorCode,
              message: applicationLogErrorMessage(
                'PAYOUT',
                order.status as PayOutOrderStatus,
                order.traderRejectReason as never,
              ),
              at: order.endAt?.toISOString() ?? order.updatedAt.toISOString(),
            }
          : null,
      applicationLogHideAssignmentSections: hideAssignmentSections,
      requisites: null,
      statusHistory: auditLogs.map((l) => mapAuditRowToAdminStatusHistory(l)),
    };
  }
}

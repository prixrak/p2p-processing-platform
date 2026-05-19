import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Sse,
  Header,
  MessageEvent,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProduces } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { merge, type Observable } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  ORDER_LIST_DIRECTION,
  directionTypeToOrderListDirection,
  MAX_PAGE_SIZE,
} from '@p2p/shared';
import { MerchantBalanceTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { MerchantsService } from './merchants.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import { SettlementsService } from '../settlements/settlements.service';
import { GenerateApiKeysDto } from './dto';
import { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import { resolveStatisticsWindow } from '../../common/utils/statistics-window';
import { buildPayinOrderSearchOr, buildPayoutOrderSearchOr } from '../../common/order-search-where';
import { payinOrderListRequisiteFields } from '../../common/payin-order-list-requisite-fields';
import { PayinRealtimeService } from '../payin/payin-realtime.service';
import { PayoutRealtimeService } from '../payout/payout-realtime.service';

@ApiTags('Merchant Cabinet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MERCHANT)
@Controller('merchant')
export class MerchantCabinetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchantsService: MerchantsService,
    private readonly merchantDirectionsService: MerchantDirectionsService,
    private readonly settlementsService: SettlementsService,
    private readonly payinRealtime: PayinRealtimeService,
    private readonly payoutRealtime: PayoutRealtimeService,
  ) {}

  @SkipThrottle()
  @Sse('orders/stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: 'SSE stream for Pay-In and Pay-Out order updates for this merchant' })
  @ApiProduces('text/event-stream')
  streamOrders(
    @CurrentUser('merchantId') merchantId: string,
  ): Observable<MessageEvent> {
    return merge(
      this.payinRealtime.streamForMerchant(merchantId),
      this.payoutRealtime.streamForMerchant(merchantId),
    );
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get own merchant balances' })
  async getBalances(@CurrentUser('merchantId') merchantId: string) {
    const merchant = await this.merchantsService.findById(merchantId);
    return merchant.balances.map((b) => ({
      currency: b.currency.code,
      available: Number(b.amount),
      frozen: 0,
    }));
  }

  @Get('balance-transactions')
  @ApiOperation({ summary: 'Merchant balance ledger (append-only, Block 5 section 5.5)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false, description: 'MerchantBalanceTransactionType' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async listBalanceTransactions(
    @CurrentUser('merchantId') merchantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where: Prisma.MerchantBalanceTransactionWhereInput = { merchantId };
    if (type) {
      const upper = type.toUpperCase();
      const allowed = Object.values(MerchantBalanceTransactionType) as string[];
      if (allowed.includes(upper)) {
        where.type = upper as MerchantBalanceTransactionType;
      }
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    const [data, total] = await Promise.all([
      this.prisma.merchantBalanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.merchantBalanceTransaction.count({ where }),
    ]);
    return { data, total, page, limit: take };
  }

  @Get('settlements')
  @ApiOperation({
    summary: 'Booked merchant withdrawals — local amount debited plus manual rate / USDT for audit',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listOwnSettlements(
    @CurrentUser('merchantId') merchantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.settlementsService.findForMerchantSelf(merchantId, page, limit);
  }

  @Get('balance-summary')
  @ApiOperation({
    summary: 'Period volumes and commission totals (Block 5 section 5.5)',
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async balancePeriodSummary(
    @CurrentUser('merchantId') merchantId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const range =
      dateFrom || dateTo
        ? {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          }
        : undefined;

    const payinWhere = {
      merchantId,
      status: 'PAID' as const,
      ...(range ? { updatedAt: range } : {}),
    };
    const payoutCompletedWhere = {
      merchantId,
      status: 'COMPLETED' as const,
      ...(range ? { updatedAt: range } : {}),
    };
    const payoutCreatedWhere = {
      merchantId,
      ...(range ? { createdAt: range } : {}),
    };

    const [payinVol, payoutVol, payinComm, payoutCommCompleted, payoutCommAllCreated] =
      await Promise.all([
        this.prisma.payinOrder.aggregate({
          where: payinWhere,
          _sum: { amount: true },
        }),
        this.prisma.payoutOrder.aggregate({
          where: payoutCompletedWhere,
          _sum: { amount: true },
        }),
        this.prisma.payinOrder.aggregate({
          where: payinWhere,
          _sum: { commission: true },
        }),
        this.prisma.payoutOrder.aggregate({
          where: payoutCompletedWhere,
          _sum: { commissionAmount: true },
        }),
        this.prisma.payoutOrder.aggregate({
          where: payoutCreatedWhere,
          _sum: { commissionAmount: true },
        }),
      ]);

    return {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      payin_volume_fiat_paid: Number(payinVol._sum.amount ?? 0),
      payout_volume_fiat_completed: Number(payoutVol._sum.amount ?? 0),
      payin_commission_fiat: Number(payinComm._sum.commission ?? 0),
      payout_commission_fiat_on_completed: Number(payoutCommCompleted._sum.commissionAmount ?? 0),
      payout_commission_fiat_on_all_created_in_period: Number(
        payoutCommAllCreated._sum.commissionAmount ?? 0,
      ),
    };
  }

  @Get('orders')
  @ApiOperation({ summary: 'List merchant orders (payin+payout)' })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getOrders(
    @CurrentUser('merchantId') merchantId: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    const createdAt = Object.keys(dateFilter).length ? dateFilter : undefined;

    const isPayout = direction === ORDER_LIST_DIRECTION.PAY_OUT;
    const resolvedPage = page ?? 1;
    const take = Math.min(limit ?? 50, MAX_PAGE_SIZE);
    const skip = (resolvedPage - 1) * take;

    if (isPayout) {
      const where: Record<string, unknown> = { merchantId };
      if (status) where.status = status.toUpperCase();
      if (createdAt) where.createdAt = createdAt;
      if (search) {
        where.OR = buildPayoutOrderSearchOr(search);
      }

      const [orders, total] = await Promise.all([
        this.prisma.payoutOrder.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          include: { currency: { select: { code: true } } },
        }),
        this.prisma.payoutOrder.count({ where }),
      ]);

      const data = orders.map((o) => ({
        id: o.id,
        externalId: o.requestId,
        type: ORDER_LIST_DIRECTION.PAY_OUT,
        amount: Number(o.amount),
        currency: o.currency.code,
        status: o.status,
        paymentMethod: '',
        customerEmail: null,
        createdAt: o.createdAt.toISOString(),
        completedAt: null,
      }));

      return {
        data,
        total,
        page: resolvedPage,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      };
    }

    const where: Record<string, unknown> = { merchantId };
    if (status) where.status = status.toUpperCase();
    if (createdAt) where.createdAt = createdAt;
    if (search) {
      where.OR = buildPayinOrderSearchOr(search);
    }

    const [orders, total] = await Promise.all([
      this.prisma.payinOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
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

    const data = orders.map((o) => ({
      id: o.id,
      externalId: o.requestId,
      type: ORDER_LIST_DIRECTION.PAY_IN,
      amount: Number(o.amount),
      currency: o.currency.code,
      status: o.status,
      paymentMethod: '',
      customerEmail: o.userFullName ?? null,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      ...payinOrderListRequisiteFields(o.traderProcessingMethod, o.requisite),
    }));

    return {
      data,
      total,
      page: resolvedPage,
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get merchant analytics' })
  @ApiQuery({ name: 'period', required: false, enum: ['24h', '7d', '30d', '90d'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getAnalytics(
    @CurrentUser('merchantId') merchantId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    const window = resolveStatisticsWindow(query);
    const createdAt = { gte: window.from, lte: window.to };

    const [
      payinAgg,
      payoutAgg,
      payinCount,
      payoutCount,
      payinSuccessful,
    ] = await Promise.all([
      this.prisma.payinOrder.aggregate({
        where: { merchantId, status: 'PAID', createdAt },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payoutOrder.aggregate({
        where: { merchantId, status: 'COMPLETED', createdAt },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payinOrder.count({ where: { merchantId, createdAt } }),
      this.prisma.payoutOrder.count({ where: { merchantId, createdAt } }),
      this.prisma.payinOrder.count({ where: { merchantId, status: 'PAID', createdAt } }),
    ]);

    const payInVolume = Number(payinAgg._sum.amount ?? 0);
    const payOutVolume = Number(payoutAgg._sum.amount ?? 0);
    const totalOrders = payinCount + payoutCount;
    const successfulTotal = payinSuccessful + (payoutAgg._count ?? 0);

    return {
      period: window.period,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      totalVolume: payInVolume + payOutVolume,
      payInVolume,
      payOutVolume,
      totalOrders,
      payInOrders: payinCount,
      payOutOrders: payoutCount,
      conversionRate: totalOrders > 0 ? (successfulTotal / totalOrders) * 100 : 0,
      avgOrderAmount: totalOrders > 0 ? (payInVolume + payOutVolume) / totalOrders : 0,
    };
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List merchant webhook logs (paginated)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getWebhooks(
    @CurrentUser('merchantId') merchantId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit?: number,
  ) {
    const outboxWhere: Record<string, unknown> = {
      OR: [
        { payinOrder: { merchantId } },
        { payoutOrder: { merchantId } },
      ],
    };
    if (status) {
      const statusMap: Record<string, string> = {
        sent: 'SENT',
        failed: 'FAILED',
        dlq: 'DLQ',
      };
      outboxWhere.status = statusMap[status] ?? status.toUpperCase();
    }

    const resolvedPage = page ?? 1;
    const take = Math.min(limit ?? 25, MAX_PAGE_SIZE);
    const skip = (resolvedPage - 1) * take;

    const [outboxes, total] = await Promise.all([
      this.prisma.webhookOutbox.findMany({
        where: outboxWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          logs: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.webhookOutbox.count({ where: outboxWhere }),
    ]);

    const data = outboxes.map((o) => {
      const lastLog = o.logs[0];
      return {
        id: o.id,
        timestamp: o.createdAt.toISOString(),
        method: o.method,
        statusCode: lastLog?.responseStatus ?? null,
        url: o.callbackUrl,
        orderId: o.payinOrderId ?? o.payoutOrderId ?? '',
        status: o.status === 'SENT' ? 'sent' : o.status === 'DLQ' ? 'dlq' : 'failed',
        responseTime: null,
        attempts: o.attempts,
      };
    });

    return {
      data,
      total,
      page: resolvedPage,
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  @Post('webhooks/:id/resend')
  @ApiOperation({ summary: 'Resend a failed webhook' })
  async resendWebhook(
    @CurrentUser('merchantId') merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const outbox = await this.prisma.webhookOutbox.findUnique({
      where: { id },
      include: {
        payinOrder: { select: { merchantId: true } },
        payoutOrder: { select: { merchantId: true } },
      },
    });

    if (!outbox) throw new ForbiddenException('Webhook not found');
    const ownerMerchantId = outbox.payinOrder?.merchantId ?? outbox.payoutOrder?.merchantId;
    if (ownerMerchantId !== merchantId) throw new ForbiddenException('Not your webhook');

    await this.prisma.webhookOutbox.update({
      where: { id },
      data: { status: 'PENDING', nextRetryAt: new Date() },
    });

    return { success: true };
  }

  @Get('directions')
  @ApiOperation({ summary: 'List own directions with commission tiers' })
  async getDirections(@CurrentUser('merchantId') merchantId: string) {
    return this.merchantDirectionsService.findByMerchant(merchantId);
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Generate a new API key pair for Pay-In or Pay-Out' })
  async generateApiKeys(
    @CurrentUser('merchantId') merchantId: string,
    @Body() dto: GenerateApiKeysDto,
  ) {
    return this.merchantsService.generateApiKeys(merchantId, dto.direction);
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List merchant API keys' })
  async getApiKeys(@CurrentUser('merchantId') merchantId: string) {
    const keys = await this.prisma.merchantApiKey.findMany({
      where: { merchantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      direction: directionTypeToOrderListDirection(k.direction),
      publicKey: k.publicKey,
      secretKeyMasked: 'sk_••••••••••••',
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: null,
    }));
  }

  @Post('api-keys/:keyId/regenerate')
  @ApiOperation({ summary: 'Regenerate an API key' })
  async regenerateApiKey(
    @CurrentUser('merchantId') merchantId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    const existing = await this.prisma.merchantApiKey.findUnique({
      where: { id: keyId },
    });
    if (!existing || existing.merchantId !== merchantId) {
      throw new ForbiddenException('Key not found or not yours');
    }

    return this.merchantsService.regenerateApiKey(keyId);
  }
}

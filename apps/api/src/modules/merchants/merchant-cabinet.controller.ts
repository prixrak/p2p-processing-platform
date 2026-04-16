import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, DirectionType } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { MerchantsService } from './merchants.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import { GenerateApiKeysDto } from './dto';

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
  ) {}

  @Get('balances')
  @ApiOperation({ summary: 'Get own merchant balances' })
  async getBalances(@CurrentUser('merchantId') merchantId: string) {
    const merchant = await this.merchantsService.findById(merchantId);
    return merchant.balances.map((b) => ({
      currency: b.currency,
      available: Number(b.amount),
      frozen: 0,
    }));
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

    const isPayout = direction === 'PAY_OUT';
    const take = limit ?? 50;
    const skip = ((page ?? 1) - 1) * take;

    if (isPayout) {
      const where: Record<string, unknown> = { merchantId };
      if (status) where.status = status.toUpperCase();
      if (createdAt) where.createdAt = createdAt;
      if (search) {
        where.OR = [
          { id: { contains: search } },
          { requestId: { contains: search } },
        ];
      }

      const orders = await this.prisma.payoutOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });

      return orders.map((o) => ({
        id: o.id,
        externalId: o.requestId,
        type: 'PAY_OUT',
        amount: Number(o.amount),
        currency: o.currency,
        status: o.status,
        paymentMethod: '',
        customerEmail: null,
        createdAt: o.createdAt.toISOString(),
        completedAt: null,
      }));
    }

    const where: Record<string, unknown> = { merchantId };
    if (status) where.status = status.toUpperCase();
    if (createdAt) where.createdAt = createdAt;
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { requestId: { contains: search } },
      ];
    }

    const orders = await this.prisma.payinOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });

    return orders.map((o) => ({
      id: o.id,
      externalId: o.requestId,
      type: 'PAY_IN',
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      paymentMethod: '',
      customerEmail: o.userFullName ?? null,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
    }));
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get merchant analytics' })
  async getAnalytics(@CurrentUser('merchantId') merchantId: string) {
    const [
      payinAgg,
      payoutAgg,
      payinCount,
      payoutCount,
      payinSuccessful,
    ] = await Promise.all([
      this.prisma.payinOrder.aggregate({
        where: { merchantId, status: 'PAID' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payoutOrder.aggregate({
        where: { merchantId, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payinOrder.count({ where: { merchantId } }),
      this.prisma.payoutOrder.count({ where: { merchantId } }),
      this.prisma.payinOrder.count({ where: { merchantId, status: 'PAID' } }),
    ]);

    const payInVolume = Number(payinAgg._sum.amount ?? 0);
    const payOutVolume = Number(payoutAgg._sum.amount ?? 0);
    const totalOrders = payinCount + payoutCount;
    const successfulTotal = payinSuccessful + (payoutAgg._count ?? 0);

    return {
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
  @ApiOperation({ summary: 'List merchant webhook logs' })
  @ApiQuery({ name: 'status', required: false })
  async getWebhooks(
    @CurrentUser('merchantId') merchantId: string,
    @Query('status') status?: string,
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

    const outboxes = await this.prisma.webhookOutbox.findMany({
      where: outboxWhere,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        logs: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
    });

    return outboxes.map((o) => {
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
      direction: k.direction === DirectionType.PAYIN ? 'PAY_IN' : 'PAY_OUT',
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

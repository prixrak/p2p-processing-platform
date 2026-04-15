import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import {
  PayOutOrderStatus,
  isValidPayOutTransition,
  WebhookMethod,
} from '@p2p/shared';
import type { PayOutOrderApiDto, ProfileDto, DetailsDto } from '@p2p/shared';
import { OrderUploadDto, PayoutOrderInfoDto } from './dto';

const ORDER_INCLUDE = {} as const;

type PayoutOrderRow = Prisma.PayoutOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── External: order_upload ───

  async orderUpload(merchantId: string, dto: OrderUploadDto): Promise<PayOutOrderApiDto> {
    if (!dto.request_id || !dto.currency || !dto.amount || !dto.details) {
      throw new BadRequestException('request_id, currency, amount, and details are required');
    }

    const direction = await this.prisma.direction.findFirst({
      where: { type: 'PAYOUT', fromCurrency: dto.currency, isOnline: true },
    });
    if (!direction) {
      throw new BadRequestException(`No active PAYOUT direction for ${dto.currency}`);
    }

    const commission = dto.amount * Number(direction.percentFee) / 100;
    const partnerAmount = dto.amount - commission;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payoutOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            amount: dto.amount,
            currency: dto.currency,
            status: 'PENDING',
            detailsType: dto.details.type as any,
            detailsNumber: dto.details.number,
            detailsOwner: dto.details.owner,
            detailsCode: dto.details.code,
            rate: Number(direction.rate),
            partnerAmount,
            percentFee: Number(direction.percentFee),
            callbackUrl: dto.callback_url,
          },
        });

        await this.createPayoutWebhookEntry(tx, created);

        return created;
      });

      return this.toPayOutOrderApiDto(order);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Order with this request_id already exists');
      }
      throw error;
    }
  }

  // ─── External: order_info ───

  async getOrderInfo(
    merchantId: string,
    id?: string,
    requestId?: string,
  ): Promise<PayOutOrderApiDto> {
    const order = await this.resolveOrder(merchantId, id, requestId);
    return this.toPayOutOrderApiDto(order);
  }

  // ─── External: info ───

  async getInfo(merchantId: string): Promise<ProfileDto> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { balances: true },
    });

    const direction = await this.prisma.direction.findFirst({
      where: { type: 'PAYOUT', isOnline: true },
    });

    const balances: Record<string, number> = {};
    for (const b of merchant.balances) {
      balances[b.currency] = Number(b.amount);
    }

    return {
      name: merchant.name,
      is_lock: merchant.isLock,
      balances,
      direction: direction
        ? {
            direction_name: direction.name,
            min_amount: Number(direction.minAmount),
            max_amount: Number(direction.maxAmount),
            rate: Number(direction.rate),
            percent: Number(direction.percentFee),
            online: direction.isOnline,
          }
        : {
            direction_name: '',
            min_amount: 0,
            max_amount: 0,
            rate: 0,
            percent: 0,
            online: false,
          },
    };
  }

  // ─── Internal: getPool ─── (PENDING orders without a trader; filtered by trader's payout limits)

  async getPool(
    traderId: string,
    filters: Record<string, string> = {},
  ) {
    const page = filters.page ? parseInt(filters.page, 10) : 1;
    const limit = filters.limit ? parseInt(filters.limit, 10) : 20;

    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) throw new NotFoundException('Trader profile not found');

    const minLimit = Number(trader.payoutMinLimit);
    const maxLimit = Number(trader.payoutMaxLimit);

    const amountFilter: Prisma.DecimalFilter = {};
    if (minLimit > 0) amountFilter.gte = minLimit;
    if (maxLimit > 0) amountFilter.lte = maxLimit;

    const where: Prisma.PayoutOrderWhereInput = {
      status: 'PENDING',
      traderId: null,
      ...(Object.keys(amountFilter).length > 0 ? { amount: amountFilter } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payoutOrder.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutOrder.count({ where }),
    ]);

    return {
      orders: items.map((o) => this.toPayOutOrderApiDto(o)),
      total,
      page,
      limit,
    };
  }

  // ─── Internal: traderTakeFromPool ─── (trader self-assigns from pool; PENDING → NEW)

  async traderTakeFromPool(traderId: string, orderId: string): Promise<PayOutOrderApiDto> {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) throw new NotFoundException('Trader profile not found');

    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, status: 'PENDING', traderId: null },
    });
    if (!order) {
      throw new NotFoundException('Order not found in pool or already taken');
    }

    const minLimit = Number(trader.payoutMinLimit);
    const maxLimit = Number(trader.payoutMaxLimit);
    const orderAmount = Number(order.amount);

    if (minLimit > 0 && orderAmount < minLimit) {
      throw new ForbiddenException(
        `Order amount ${orderAmount} is below your minimum limit ${minLimit}`,
      );
    }
    if (maxLimit > 0 && orderAmount > maxLimit) {
      throw new ForbiddenException(
        `Order amount ${orderAmount} exceeds your maximum limit ${maxLimit}`,
      );
    }

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.NEW)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> NEW`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { traderId, status: 'NEW' },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Trader ${traderId} self-assigned payout order ${orderId} from pool`);

      return result;
    });

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: assignToTrader ─── (admin/support assigns from pool to a specific trader)

  async assignToTrader(orderId: string, traderId: string): Promise<PayOutOrderApiDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, status: 'PENDING', traderId: null },
    });
    if (!order) {
      throw new NotFoundException('Order not found in pool (must be PENDING with no trader)');
    }

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.NEW)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> NEW`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { traderId, status: 'NEW' },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Admin assigned payout order ${orderId} to trader ${traderId}`);

      return result;
    });

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: getTraderOrders ───

  async getTraderOrders(traderId: string, filters: Record<string, string>) {
    const page = filters.page ? parseInt(filters.page, 10) : 1;
    const limit = filters.limit ? parseInt(filters.limit, 10) : 20;

    const status =
      filters.status &&
      (Object.values(PayoutStatus) as string[]).includes(filters.status)
        ? (filters.status as PayoutStatus)
        : undefined;

    const where: Prisma.PayoutOrderWhereInput = {
      traderId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payoutOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutOrder.count({ where }),
    ]);

    return {
      orders: items.map((o) => this.toPayOutOrderApiDto(o)),
      total,
      page,
      limit,
    };
  }

  // ─── Internal: traderStartProcessing ─── (NEW → PROCESSING)

  async traderStartProcessing(traderId: string, orderId: string): Promise<PayOutOrderApiDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId, status: 'NEW' },
    });
    if (!order) {
      throw new NotFoundException('Order not found, not assigned to this trader, or not in NEW status');
    }

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.PROCESSING)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> PROCESSING`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { status: 'PROCESSING', startAt: new Date() },
      });

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: traderComplete ───

  async traderComplete(traderId: string, orderId: string): Promise<PayOutOrderApiDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId },
    });
    if (!order) throw new NotFoundException('Order not found or not assigned to this trader');

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.COMPLETED)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> COMPLETED`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { status: 'COMPLETED', endAt: new Date() },
      });

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: traderFail ───

  async traderFail(
    traderId: string,
    orderId: string,
    _reason?: string,
  ): Promise<PayOutOrderApiDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId },
    });
    if (!order) throw new NotFoundException('Order not found or not assigned to this trader');

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.FAILED)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> FAILED`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { status: 'FAILED', endAt: new Date() },
      });

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Private helpers ───

  private async resolveOrder(merchantId: string, id?: string, requestId?: string) {
    if (!id && !requestId) {
      throw new BadRequestException('Either id or request_id must be provided');
    }

    const order = await this.prisma.payoutOrder.findFirst({
      where: {
        merchantId,
        ...(id ? { id } : { requestId: requestId! }),
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async createPayoutWebhookEntry(
    tx: Prisma.TransactionClient,
    order: PayoutOrderRow,
  ): Promise<void> {
    if (!order.callbackUrl) return;

    await tx.webhookOutbox.create({
      data: {
        payoutOrderId: order.id,
        method: WebhookMethod.PAYOUT_UPDATE_STATUS_ORDER as any,
        payloadJson: {
          id: order.id,
          order_id: order.requestId,
          order_status: order.status,
          amount: Number(order.amount),
        },
        callbackUrl: order.callbackUrl,
      },
    });
  }

  private toPayOutOrderApiDto(order: PayoutOrderRow): PayOutOrderApiDto {
    const details: DetailsDto = {
      type: order.detailsType as any,
      number: order.detailsNumber,
      owner: order.detailsOwner ?? undefined,
      code: order.detailsCode ?? undefined,
    };

    return {
      id: order.id,
      request_id: order.requestId,
      created_at: Math.floor(order.createdAt.getTime() / 1000),
      start_at: order.startAt ? Math.floor(order.startAt.getTime() / 1000) : null,
      end_at: order.endAt ? Math.floor(order.endAt.getTime() / 1000) : null,
      currency: order.currency,
      details,
      amount: Number(order.amount),
      status: order.status as PayOutOrderStatus,
      rate: Number(order.rate),
      partner_amount: Number(order.partnerAmount),
      percent_fee: Number(order.percentFee),
    };
  }
}

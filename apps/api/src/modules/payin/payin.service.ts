import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { RequisitesService } from '../requisites/requisites.service';
import { BanksService } from '../banks/banks.service';
import { FilesService, UploadedFile } from '../files/files.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import {
  PayInOrderStatus,
  isValidPayInTransition,
  WebhookMethod,
  DirectionType,
  MAX_PAGE_SIZE,
} from '@p2p/shared';
import type {
  OrderDto,
  OrderResponseDto,
  H2HOrderResponseDto,
  ProfileDto,
  PayInCheckAvailabilityResponseDto,
  PaymentBankApiDto,
  AppealDto as AppealDtoType,
} from '@p2p/shared';
import { BalanceTransactionType } from '@prisma/client';
import { config } from '@p2p/config';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  UploadOrderDto,
  UpdateOrderDto,
  OrderInfoDto,
  H2hInitDto,
  H2hCheckAvailabilityDto,
  BanksQueryDto,
  AppealSendDto,
  TraderOrderFiltersDto,
  TraderConfirmPaidDto,
} from './dto';

const ORDER_INCLUDE = {
  requisite: { include: { bank: true } },
  appeals: { include: { proofs: true } },
} as const;

type OrderWithRelations = Prisma.PayinOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class PayinService {
  private readonly logger = new Logger(PayinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requisitesService: RequisitesService,
    private readonly banksService: BanksService,
    private readonly filesService: FilesService,
    private readonly merchantDirectionsService: MerchantDirectionsService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  private async getAutocloseMs(): Promise<number> {
    const setting = await this.platformSettings.findOne('payin_autoclose_minutes');
    const minutes = Math.max(1, parseInt(setting.value, 10) || 30);
    return minutes * 60 * 1000;
  }

  // ─── External: upload_order ───

  async uploadOrder(merchantId: string, dto: UploadOrderDto): Promise<OrderResponseDto> {
    if (dto.callback_url) {
      await validateCallbackUrl(dto.callback_url);
    }
    const direction = await this.findActiveDirection(dto.currency, DirectionType.PAYIN);

    const merchantCommissionPct =
      await this.merchantDirectionsService.getEffectiveCommissionPercent(
        merchantId,
        'PAYIN',
        dto.currency,
        dto.amount,
      );
    const commissionPercent = merchantCommissionPct ?? Number(direction.percentFee);
    const commission = dto.amount * commissionPercent / 100;
    const partnerAmount = dto.amount - commission;
    const autocloseAt = new Date(Date.now() + await this.getAutocloseMs());
    const amountDec = new Prisma.Decimal(dto.amount);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM requisites
          WHERE currency = ${dto.currency}
            AND is_active = true
            AND min_amount <= ${amountDec}
            AND max_amount >= ${amountDec}
            AND used_amount < limit_total_amount
            AND used_ops < limit_total_ops
          ORDER BY used_ops ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

        if (lockedRows.length === 0) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const requisite = await tx.requisite.findUnique({
          where: { id: lockedRows[0].id },
          include: { bank: true, trader: true },
        });

        if (!requisite) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const created = await tx.payinOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            traderId: requisite.traderId,
            requisiteId: requisite.id,
            amount: dto.amount,
            currency: dto.currency,
            commissionPercent,
            commission,
            partnerAmount,
            rate: Number(direction.rate),
            status: 'NEW',
            userFullName: dto.user_full_name,
            userIdExternal: dto.user_id,
            callbackUrl: dto.callback_url,
            autocloseAt,
            isH2h: false,
          },
          include: ORDER_INCLUDE,
        });

        await tx.requisite.update({
          where: { id: requisite.id },
          data: {
            usedAmount: { increment: dto.amount },
            usedOps: { increment: 1 },
          },
        });

        await this.createPayinWebhookEntry(tx, created);

        return created;
      });

      return {
        order: this.toOrderDto(order),
        form_uri: `${config.app.frontendUrl}/pay/${order.id}`,
      };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  // ─── External: update_order ───

  async updateOrder(merchantId: string, dto: UpdateOrderDto): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, dto.id, dto.request_id);

    if (!dto.status) {
      throw new BadRequestException('Status is required');
    }

    const allowedMerchantStatuses = [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED];
    if (!allowedMerchantStatuses.includes(dto.status)) {
      throw new BadRequestException(`Merchants can only set VERIFIED or CANCELED`);
    }

    if (!isValidPayInTransition(order.status as PayInOrderStatus, dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${dto.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: {
          status: dto.status,
          ...(dto.status === PayInOrderStatus.VERIFIED ? { confirmedAt: new Date() } : {}),
        },
        include: ORDER_INCLUDE,
      });

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    if (dto.status === PayInOrderStatus.CANCELED && order.requisiteId) {
      await this.requisitesService.releaseUsage(order.requisiteId, Number(order.amount));
    }

    return this.toOrderDto(updated);
  }

  // ─── External: update_order_with_proofs ───

  async updateOrderWithProofs(
    merchantId: string,
    orderId: string,
    status: PayInOrderStatus,
    files: UploadedFile[],
  ): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, orderId, undefined);

    const allowedStatuses = [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`Status must be VERIFIED or CANCELED`);
    }

    if (!isValidPayInTransition(order.status as PayInOrderStatus, status)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${status}`,
      );
    }

    const fileIds = await this.filesService.saveFiles(files);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === PayInOrderStatus.VERIFIED ? { confirmedAt: new Date() } : {}),
        },
        include: ORDER_INCLUDE,
      });

      if (fileIds.length > 0) {
        const appeal = await tx.appeal.create({
          data: {
            payinOrderId: order.id,
            paidAmount: Number(order.amount),
            status: 'OPEN',
          },
        });
        for (const fileId of fileIds) {
          await tx.appealProof.create({
            data: { appealId: appeal.id, fileId },
          });
        }
      }

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    if (status === PayInOrderStatus.CANCELED && order.requisiteId) {
      await this.requisitesService.releaseUsage(order.requisiteId, Number(order.amount));
    }

    const refreshed = await this.prisma.payinOrder.findUniqueOrThrow({
      where: { id: updated.id },
      include: ORDER_INCLUDE,
    });

    return this.toOrderDto(refreshed);
  }

  // ─── External: order_info ───

  async getOrderInfo(merchantId: string, id?: string, requestId?: string): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, id, requestId);
    return this.toOrderDto(order);
  }

  // ─── External: info ───

  async getInfo(merchantId: string): Promise<ProfileDto> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { balances: true },
    });

    const direction = await this.prisma.direction.findFirst({
      where: { type: 'PAYIN', isOnline: true },
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

  // ─── External: h2h_init ───

  async h2hInit(merchantId: string, dto: H2hInitDto): Promise<H2HOrderResponseDto> {
    if (dto.callback_url) {
      await validateCallbackUrl(dto.callback_url);
    }
    const direction = await this.findActiveDirection(dto.currency, DirectionType.PAYIN);

    const commission = dto.amount * Number(direction.percentFee) / 100;
    const partnerAmount = dto.amount - commission;
    const autocloseAt = new Date(Date.now() + await this.getAutocloseMs());
    const amountDec = new Prisma.Decimal(dto.amount);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM requisites
          WHERE currency = ${dto.currency}
            AND is_active = true
            AND min_amount <= ${amountDec}
            AND max_amount >= ${amountDec}
            AND used_amount < limit_total_amount
            AND used_ops < limit_total_ops
          ORDER BY used_ops ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

        if (lockedRows.length === 0) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const requisite = await tx.requisite.findUnique({
          where: { id: lockedRows[0].id },
          include: { bank: true, trader: true },
        });

        if (!requisite) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const created = await tx.payinOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            traderId: requisite.traderId,
            requisiteId: requisite.id,
            amount: dto.amount,
            currency: dto.currency,
            commission,
            partnerAmount,
            rate: Number(direction.rate),
            status: 'NEW',
            userFullName: dto.user_full_name,
            userIdExternal: dto.user_id,
            callbackUrl: dto.callback_url,
            redirectUrl: dto.redirect_url,
            autocloseAt,
            isH2h: true,
          },
          include: ORDER_INCLUDE,
        });

        await tx.requisite.update({
          where: { id: requisite.id },
          data: {
            usedAmount: { increment: dto.amount },
            usedOps: { increment: 1 },
          },
        });

        await this.createPayinWebhookEntry(tx, created);

        return created;
      });

      return { order: this.toOrderDto(order) };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  // ─── External: h2h_check_availability ───

  async h2hCheckAvailability(
    merchantId: string,
    dto: H2hCheckAvailabilityDto,
  ): Promise<PayInCheckAvailabilityResponseDto> {
    const requisite = await this.requisitesService.findAvailable(dto.currency, dto.amount);

    return {
      request_id: dto.request_id,
      available: !!requisite,
      amount: dto.amount,
      rounded_amount: dto.amount,
      currency: dto.currency,
      checked_at: Math.floor(Date.now() / 1000),
    };
  }

  // ─── External: banks ───

  async getBanks(merchantId: string, currency?: string): Promise<PaymentBankApiDto[]> {
    return this.banksService.findAll(currency);
  }

  // ─── External: appeal/send ───

  async appealSend(
    merchantId: string,
    dto: AppealSendDto,
    files: UploadedFile[],
  ): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, dto.order_id, undefined);

    if (!isValidPayInTransition(order.status as PayInOrderStatus, PayInOrderStatus.APPEAL)) {
      throw new BadRequestException(
        `Cannot appeal order in status ${order.status}`,
      );
    }

    const fileIds = await this.filesService.saveFiles(files);

    const updated = await this.prisma.$transaction(async (tx) => {
      const appeal = await tx.appeal.create({
        data: {
          payinOrderId: order.id,
          paidAmount: dto.paid_amount,
          status: 'OPEN',
        },
      });

      for (const fileId of fileIds) {
        await tx.appealProof.create({
          data: { appealId: appeal.id, fileId },
        });
      }

      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: { status: 'APPEAL' },
        include: ORDER_INCLUDE,
      });

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    return this.toOrderDto(updated);
  }

  // ─── Internal (Trader): list orders ───

  async getTraderOrders(traderId: string, filters: TraderOrderFiltersDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const where: Prisma.PayinOrderWhereInput = {
      traderId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payinOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payinOrder.count({ where }),
    ]);

    return {
      items: items.map((o) => this.toOrderDto(o)),
      total,
      page,
      limit,
    };
  }

  // ─── Internal (Trader): confirm paid ───

  async traderConfirmPaid(traderId: string, orderId: string, actualAmount?: number) {
    const order = await this.prisma.payinOrder.findFirst({
      where: { id: orderId, traderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');

    let targetStatus: PayInOrderStatus;
    const orderAmount = Number(order.amount);

    if (actualAmount === undefined || actualAmount === orderAmount) {
      targetStatus = PayInOrderStatus.PAID;
    } else if (actualAmount < orderAmount) {
      targetStatus = PayInOrderStatus.UNDERPAID;
    } else {
      targetStatus = PayInOrderStatus.OVERPAID;
    }

    if (!isValidPayInTransition(order.status as PayInOrderStatus, targetStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${targetStatus}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: { status: targetStatus },
        include: ORDER_INCLUDE,
      });

      if (targetStatus === PayInOrderStatus.PAID) {
        await this.creditBalancesOnPaid(tx, order);
      }

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    return this.toOrderDto(updated);
  }

  // ─── Internal (Trader): cancel ───

  async traderCancelOrder(traderId: string, orderId: string) {
    const order = await this.prisma.payinOrder.findFirst({
      where: { id: orderId, traderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidPayInTransition(order.status as PayInOrderStatus, PayInOrderStatus.CANCELED)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> CANCELED`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELED' },
        include: ORDER_INCLUDE,
      });

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    if (order.requisiteId) {
      await this.requisitesService.releaseUsage(order.requisiteId, Number(order.amount));
    }

    return this.toOrderDto(updated);
  }

  // ─── Private helpers ───

  private async resolveOrder(merchantId: string, id?: string, requestId?: string) {
    if (!id && !requestId) {
      throw new BadRequestException('Either id or request_id must be provided');
    }

    const order = await this.prisma.payinOrder.findFirst({
      where: {
        merchantId,
        ...(id ? { id } : { requestId: requestId! }),
      },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async findActiveDirection(currency: string, type: DirectionType) {
    const direction = await this.prisma.direction.findFirst({
      where: { type, fromCurrency: currency, isOnline: true },
    });
    if (!direction) {
      throw new BadRequestException(`No active ${type} direction for ${currency}`);
    }
    return direction;
  }

  private async createPayinWebhookEntry(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
  ): Promise<void> {
    if (!order.callbackUrl) return;

    await tx.webhookOutbox.create({
      data: {
        payinOrderId: order.id,
        method: WebhookMethod.PAYIN_UPDATE_STATUS_ORDER as any,
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

  private toOrderDto(order: OrderWithRelations): OrderDto {
    return {
      id: order.id,
      request_id: order.requestId,
      created_at: Math.floor(order.createdAt.getTime() / 1000),
      confirmed_at: order.confirmedAt
        ? Math.floor(order.confirmedAt.getTime() / 1000)
        : null,
      autoclose_at: order.autocloseAt
        ? Math.floor(order.autocloseAt.getTime() / 1000)
        : null,
      currency: order.currency,
      amount: Number(order.amount),
      commission: Number(order.commission),
      partner_amount: Number(order.partnerAmount),
      rate: Number(order.rate),
      status: order.status as PayInOrderStatus,
      requisite_number: order.requisite?.number ?? '',
      requisite_owner: order.requisite?.owner ?? '',
      bank: order.requisite?.bank?.name ?? '',
      redirect_url: order.redirectUrl,
      appeals: (order.appeals ?? []).map((a): AppealDtoType => ({
        id: a.id,
        status: a.status as any,
        created_at: Math.floor(a.createdAt.getTime() / 1000),
        paid_amount: Number(a.paidAmount),
        proofs_of_payment: (a.proofs ?? []).map((p) => p.fileId),
      })),
      payment_detail: order.requisite
        ? {
            id: order.requisite.id,
            type: order.requisite.type,
            number: order.requisite.number,
            owner: order.requisite.owner,
            code: order.requisite.code ?? '',
            bank_name: order.requisite.bank?.name ?? '',
          }
        : null,
    };
  }

  /**
   * RISK NOTE: modifies merchant and trader balances.
   * Merchant gets credited with partnerAmount, trader gets the commission.
   */
  private async creditBalancesOnPaid(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
  ): Promise<void> {
    const partnerAmount = Number(order.partnerAmount);
    const commission = Number(order.commission);

    // Credit merchant balance
    await tx.merchantBalance.upsert({
      where: {
        merchantId_currency: {
          merchantId: order.merchantId,
          currency: order.currency,
        },
      },
      create: {
        merchantId: order.merchantId,
        currency: order.currency,
        amount: partnerAmount,
      },
      update: { amount: { increment: partnerAmount } },
    });

    // Credit trader balance with commission
    if (order.traderId && commission > 0) {
      await tx.traderBalance.upsert({
        where: {
          traderId_currency: {
            traderId: order.traderId,
            currency: order.currency,
          },
        },
        create: {
          traderId: order.traderId,
          currency: order.currency,
          amount: commission,
        },
        update: { amount: { increment: commission } },
      });

      await this.balanceTxService.record({
        traderId: order.traderId,
        type: BalanceTransactionType.PAYIN_COMMISSION,
        amount: commission,
        currency: order.currency,
        referenceId: order.id,
        comment: `Pay-in commission for order ${order.id}`,
        tx,
      });
    }

    this.logger.log(
      `Balances updated for PAID order ${order.id}: merchant +${partnerAmount}, trader +${commission} ${order.currency}`,
    );
  }

  private handleUniqueConstraint(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Order with this request_id already exists');
    }
  }

  async getPublicOrderInfo(orderId: string) {
    const order = await this.prisma.payinOrder.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return this.toOrderDto(order);
  }

  async confirmFromPaymentPage(orderId: string, files: UploadedFile[]) {
    const order = await this.prisma.payinOrder.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    if (!isValidPayInTransition(order.status as PayInOrderStatus, PayInOrderStatus.VERIFIED)) {
      throw new BadRequestException(
        `Cannot confirm payment for order in status ${order.status}`,
      );
    }

    const fileIds = files.length > 0
      ? await this.filesService.saveFiles(files)
      : [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: orderId },
        data: { status: 'VERIFIED', confirmedAt: new Date() },
        include: ORDER_INCLUDE,
      });

      if (fileIds.length > 0) {
        const appeal = await tx.appeal.create({
          data: {
            payinOrderId: orderId,
            paidAmount: Number(order.amount),
            status: 'OPEN',
          },
        });
        for (const fileId of fileIds) {
          await tx.appealProof.create({
            data: { appealId: appeal.id, fileId },
          });
        }
      }

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    return this.toOrderDto(updated);
  }
}

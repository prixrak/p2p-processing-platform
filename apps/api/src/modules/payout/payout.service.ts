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
  MAX_PAGE_SIZE,
  DirectionType,
  PAYOUT_ORDER_REALTIME_EVENT_TYPE,
  PAYOUT_TRADER_IN_PROGRESS_STATUSES,
  PAYOUT_TRADER_HISTORY_STATUSES,
} from '@p2p/shared';
import type { PayOutOrderApiDto, ProfileDto, DetailsDto } from '@p2p/shared';
import {
  creditUsdtPayout,
  debitUahMerchantPayout,
  percentToFraction,
  platformMarginUah,
  platformMarginUsdtPayout,
  rateAdminOut,
  rateTraderOut,
} from '@p2p/shared';
import {
  BalanceTransactionType,
  DirectionType as PrismaDirectionType,
  MerchantBalanceTransactionType,
  PlatformIncomeOrderType,
} from '@prisma/client';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { OrderUploadDto, PayoutOrderInfoDto, PayoutListFiltersDto } from './dto';
import { PayoutRealtimeService } from './payout-realtime.service';

const ORDER_INCLUDE = {} as const;

type PayoutOrderRow = Prisma.PayoutOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly payoutRealtime: PayoutRealtimeService,
    private readonly merchantDirections: MerchantDirectionsService,
    private readonly exchangeRate: ExchangeRateService,
  ) {}

  private emitPayoutOrderRealtime(order: PayoutOrderRow, poolChanged: boolean): void {
    void this.payoutRealtime.publish({
      type: PAYOUT_ORDER_REALTIME_EVENT_TYPE,
      orderId: order.id,
      status: order.status as PayOutOrderStatus,
      traderId: order.traderId,
      merchantId: order.merchantId,
      poolChanged,
    });
  }

  // ─── External: order_upload ───

  async orderUpload(merchantId: string, dto: OrderUploadDto): Promise<PayOutOrderApiDto> {
    if (!dto.request_id || !dto.currency || !dto.amount || !dto.details) {
      throw new BadRequestException('request_id, currency, amount, and details are required');
    }

    if (dto.callback_url) {
      await validateCallbackUrl(dto.callback_url);
    }

    const direction = await this.prisma.direction.findFirst({
      where: { type: DirectionType.PAYOUT, fromCurrency: dto.currency, isOnline: true },
    });
    if (!direction) {
      throw new BadRequestException(`No active PAYOUT direction for ${dto.currency}`);
    }

    const merchantPct =
      (await this.merchantDirections.getEffectiveCommissionPercent(
        merchantId,
        PrismaDirectionType.PAYOUT,
        dto.currency,
        dto.amount,
      )) ?? Number(direction.percentFee);

    const isUahV2 = dto.currency === 'UAH';
    let parserRate: number | undefined;
    let rateAdminOutVal: number | undefined;
    if (isUahV2) {
      try {
        parserRate = await this.exchangeRate.requireParserRateUaPerUsdt();
      } catch {
        throw new BadRequestException(
          'Exchange rate temporarily unavailable. Please try again shortly.',
        );
      }
      rateAdminOutVal = rateAdminOut(parserRate, percentToFraction(merchantPct));
    }

    const merchantFrac = percentToFraction(merchantPct);
    const merchantDebitUah = isUahV2 ? debitUahMerchantPayout(dto.amount, merchantFrac) : null;
    const feeUah = merchantDebitUah !== null ? merchantDebitUah - dto.amount : null;
    const partnerAmount = isUahV2 ? dto.amount : dto.amount - dto.amount * merchantPct / 100;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        if (isUahV2 && merchantDebitUah !== null) {
          let bal = await tx.merchantBalance.findUnique({
            where: {
              merchantId_currency: { merchantId, currency: dto.currency },
            },
          });
          if (!bal) {
            bal = await tx.merchantBalance.create({
              data: { merchantId, currency: dto.currency, amount: 0 },
            });
          }
          if (Number(bal.amount) < merchantDebitUah) {
            throw new BadRequestException('Insufficient balance on merchant account');
          }

          await tx.merchantBalance.update({
            where: {
              merchantId_currency: { merchantId, currency: dto.currency },
            },
            data: { amount: { increment: -merchantDebitUah } },
          });
        }

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
            commissionAmount: feeUah ?? dto.amount * merchantPct / 100,
            percentFee: merchantPct,
            parserRate: parserRate ?? undefined,
            rateAdminOut: rateAdminOutVal ?? undefined,
            merchantDebitUah: merchantDebitUah ?? undefined,
            callbackUrl: dto.callback_url,
          },
        });

        if (isUahV2 && merchantDebitUah !== null) {
          await tx.merchantBalanceTransaction.create({
            data: {
              merchantId,
              type: MerchantBalanceTransactionType.PAYOUT_DEBIT,
              amount: merchantDebitUah,
              currency: dto.currency,
              referenceId: created.id,
              comment: `Pay-out reserve for order ${created.id}`,
            },
          });
        }

        await this.createPayoutWebhookEntry(tx, created);

        return created;
      });

      this.emitPayoutOrderRealtime(order, true);

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
      where: { type: DirectionType.PAYOUT, isOnline: true },
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
    filters: PayoutListFiltersDto = {},
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!trader) throw new NotFoundException('Trader profile not found');

    if (!trader.isActive || !trader.acceptingOrders) {
      return {
        orders: [],
        total: 0,
        page,
        limit,
      };
    }

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

    if (!trader.isActive || !trader.acceptingOrders) {
      throw new ForbiddenException(
        'You are paused: turn on "Receiving new orders" in the sidebar to take payout tasks.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the row to prevent concurrent claims
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; amount: number }>>`
        SELECT id, status, amount::numeric AS amount
        FROM payout_orders
        WHERE id = ${orderId}::uuid
          AND status = 'PENDING'
          AND trader_id IS NULL
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        throw new ConflictException('Order not found in pool or already taken by another trader');
      }

      const order = rows[0];
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

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { traderId, status: 'NEW' },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Trader ${traderId} self-assigned payout order ${orderId} from pool`);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, true);

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: assignToTrader ─── (admin/support assigns from pool to a specific trader)

  async assignToTrader(orderId: string, traderId: string): Promise<PayOutOrderApiDto> {
    const targetTrader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
    });
    if (!targetTrader) {
      throw new NotFoundException('Trader profile not found');
    }
    if (!targetTrader.isActive || !targetTrader.acceptingOrders) {
      throw new BadRequestException(
        'This trader is not accepting new assignments (inactive or paused)',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the row to prevent concurrent assignment
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM payout_orders
        WHERE id = ${orderId}::uuid
          AND status = 'PENDING'
          AND trader_id IS NULL
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        throw new NotFoundException('Order not found in pool (must be PENDING with no trader)');
      }

      const order = rows[0];
      if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.NEW)) {
        throw new BadRequestException(
          `Invalid status transition: ${order.status} -> NEW`,
        );
      }

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { traderId, status: 'NEW' },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Admin assigned payout order ${orderId} to trader ${traderId}`);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, true);

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Internal: getTraderOrders ───

  async getTraderOrders(traderId: string, filters: PayoutListFiltersDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const parsedStatus =
      filters.status &&
      (Object.values(PayoutStatus) as string[]).includes(filters.status)
        ? (filters.status as PayoutStatus)
        : undefined;

    let statusFilter: Prisma.PayoutOrderWhereInput['status'];
    if (filters.queue === 'in_progress') {
      const allowed = PAYOUT_TRADER_IN_PROGRESS_STATUSES as unknown as PayoutStatus[];
      if (parsedStatus) {
        statusFilter = allowed.includes(parsedStatus) ? parsedStatus : { in: [] };
      } else {
        statusFilter = { in: allowed };
      }
    } else if (filters.queue === 'history') {
      const allowed = PAYOUT_TRADER_HISTORY_STATUSES as unknown as PayoutStatus[];
      if (parsedStatus) {
        statusFilter = allowed.includes(parsedStatus) ? parsedStatus : { in: [] };
      } else {
        statusFilter = { in: allowed };
      }
    } else if (parsedStatus) {
      statusFilter = parsedStatus;
    }

    const where: Prisma.PayoutOrderWhereInput = {
      traderId,
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
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

    this.emitPayoutOrderRealtime(updated, false);

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

      if (
        order.merchantDebitUah != null &&
        order.parserRate != null &&
        order.rateAdminOut != null &&
        order.traderId
      ) {
        await this.settlePayoutV2(tx, order);
      } else {
        await this.debitMerchantOnCompleted(tx, order);
      }

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

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

      if (order.merchantDebitUah != null) {
        const refund = Number(order.merchantDebitUah);
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
            amount: refund,
          },
          update: { amount: { increment: refund } },
        });
        await tx.merchantBalanceTransaction.create({
          data: {
            merchantId: order.merchantId,
            type: MerchantBalanceTransactionType.PAYOUT_REFUND,
            amount: refund,
            currency: order.currency,
            referenceId: order.id,
            comment: `Pay-out failed refund for order ${order.id}`,
          },
        });
      }

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderApiDto(updated);
  }

  // ─── Private helpers ───

  /**
   * RISK NOTE: UAH Pay-Out v2 — merchant was debited at order creation; credit trader USDT and book platform margin.
   */
  private async settlePayoutV2(tx: Prisma.TransactionClient, order: PayoutOrderRow): Promise<void> {
    if (!order.traderId || order.parserRate == null || order.rateAdminOut == null) {
      throw new BadRequestException('Payout v2 settlement: missing trader or rate snapshot');
    }

    const trader = await tx.traderProfile.findUnique({ where: { id: order.traderId } });
    if (!trader) {
      throw new BadRequestException('Trader not found for payout settlement');
    }

    const P = Number(order.parserRate);
    const amountUah = Number(order.amount);
    const rateTraderOutVal = rateTraderOut(P, Number(trader.payoutRate));
    const rateAdminOutVal = Number(order.rateAdminOut);
    const creditUsdtVal = creditUsdtPayout(amountUah, rateTraderOutVal);
    const marginUsdt = platformMarginUsdtPayout(amountUah, rateAdminOutVal, rateTraderOutVal);
    const marginUah = platformMarginUah(marginUsdt, P);
    const merchantFrac = percentToFraction(Number(order.percentFee));

    await tx.payoutOrder.update({
      where: { id: order.id },
      data: { rateTraderOut: rateTraderOutVal },
    });

    await tx.traderBalance.upsert({
      where: {
        traderId_currency: {
          traderId: order.traderId,
          currency: 'USDT',
        },
      },
      create: {
        traderId: order.traderId,
        currency: 'USDT',
        amount: creditUsdtVal,
      },
      update: { amount: { increment: creditUsdtVal } },
    });

    await this.balanceTxService.record({
      traderId: order.traderId,
      type: BalanceTransactionType.PAYOUT_CREDIT,
      amount: creditUsdtVal,
      currency: 'USDT',
      referenceId: order.id,
      comment: `Pay-out USDT credit for order ${order.id}`,
      tx,
    });

    await tx.platformIncome.create({
      data: {
        orderId: order.id,
        orderType: PlatformIncomeOrderType.PAYOUT,
        merchantId: order.merchantId,
        traderId: order.traderId,
        orderAmountUah: amountUah,
        parserRate: P,
        rateTrader: rateTraderOutVal,
        rateAdmin: rateAdminOutVal,
        traderRatePct: Number(trader.payoutRate),
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeUah: marginUah,
      },
    });

    this.logger.log(
      `Payout v2 settled ${order.id}: trader +${creditUsdtVal} USDT, platform +${marginUsdt} USDT`,
    );
  }

  /**
   * RISK NOTE: legacy payout — deducts merchant balance and credits trader commission in order currency.
   */
  private async debitMerchantOnCompleted(
    tx: Prisma.TransactionClient,
    order: PayoutOrderRow,
  ): Promise<void> {
    const amount = Number(order.amount);
    const commission = Number(order.percentFee) * amount / 100;

    // Debit merchant balance
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
        amount: -amount,
      },
      update: { amount: { increment: -amount } },
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
        type: BalanceTransactionType.PAYOUT_DEBIT,
        amount: commission,
        currency: order.currency,
        referenceId: order.id,
        comment: `Pay-out commission for order ${order.id}`,
        tx,
      });
    }

    this.logger.log(
      `Balances updated for COMPLETED payout ${order.id}: merchant -${amount} ${order.currency}`,
    );
  }

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

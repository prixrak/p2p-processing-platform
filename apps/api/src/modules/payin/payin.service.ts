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
  PAYIN_ORDER_REALTIME_EVENT_TYPE,
  PAYIN_TRADER_CURRENT_STATUSES,
  PAYIN_TRADER_HISTORY_STATUSES,
} from '@p2p/shared';
import type {
  OrderDto,
  OrderResponseDto,
  H2HOrderResponseDto,
  ProfileDto,
  PayInCheckAvailabilityResponseDto,
  PaymentBankApiDto,
} from '@p2p/shared';
import {
  BalanceTransactionType,
  MerchantBalanceTransactionType,
  PlatformIncomeOrderType,
} from '@prisma/client';
import { config } from '@p2p/config';
import {
  creditUahMerchantPayin,
  debitUsdtPayin,
  percentToFraction,
  platformMarginUah,
  platformMarginUsdtPayin,
  rateAdminIn,
  rateTraderIn,
} from '@p2p/shared';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES,
} from '../platform-settings/platform-settings.service';
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
import { PayinRealtimeService } from './payin-realtime.service';
import { validate as uuidValidate } from 'uuid';
import { CascadeService } from '../cascade/cascade.service';
import { CascadeRedisStateService } from '../cascade/cascade-redis-state.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  ORDER_INCLUDE,
  type OrderWithRelations,
  payinOrderToOrderDto,
} from './payin-order.mapper';

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
    private readonly payinRealtime: PayinRealtimeService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly cascadeService: CascadeService,
    private readonly cascadeCoverageCache: CascadeRedisStateService,
    private readonly telegram: TelegramService,
  ) {}

  private emitPayinOrderRealtime(order: {
    id: string;
    traderId: string | null;
    merchantId: string;
    status: PayInOrderStatus;
  }): void {
    void this.payinRealtime.publish({
      type: PAYIN_ORDER_REALTIME_EVENT_TYPE,
      orderId: order.id,
      status: order.status,
      traderId: order.traderId,
      merchantId: order.merchantId,
    });
  }

  private async getAutocloseMs(): Promise<number> {
    const setting = await this.platformSettings.findOne(PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES);
    const minutes = Math.max(1, parseInt(setting.value, 10) || 10);
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
        DirectionType.PAYIN,
        dto.currency,
        dto.amount,
      );
    const commissionPercent = merchantCommissionPct ?? Number(direction.percentFee);
    const commission = dto.amount * commissionPercent / 100;
    const partnerAmount = dto.amount - commission;
    const autocloseAt = new Date(Date.now() + await this.getAutocloseMs());
    const isUahV2 = dto.currency === 'UAH';
    let parserRate: number | undefined;
    if (isUahV2) {
      try {
        parserRate = await this.exchangeRate.requireParserRateUaPerUsdt();
      } catch {
        throw new BadRequestException(
          'Exchange rate temporarily unavailable. Please try again shortly.',
        );
      }
    }

    let redisCascadeLockId: string | undefined;
    try {
      const txStarted = Date.now();
      const order = await this.prisma.$transaction(async (tx) => {
        const picked = await this.cascadeService.lockBestRequisiteForPayIn(tx, {
          amount: dto.amount,
          currency: dto.currency,
          parserRate,
          enforceUsdtCapacity: isUahV2,
        });

        if (!picked) {
          const merchantFracNr = percentToFraction(commissionPercent);
          const raInNr =
            isUahV2 && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracNr)
              : null;

          const createdNr = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              amount: dto.amount,
              currency: dto.currency,
              commissionPercent,
              commission,
              partnerAmount,
              rate: Number(direction.rate),
              parserRate: isUahV2 && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInNr ?? undefined,
              status: 'NO_REQUISITE',
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              autocloseAt,
              isH2h: false,
            },
            include: ORDER_INCLUDE,
          });

          await this.createPayinWebhookEntry(tx, createdNr);
          return createdNr;
        }

        if (picked.redisLockHeld) {
          redisCascadeLockId = picked.requisiteId;
        }

        const requisite = await tx.requisite.findUnique({
          where: { id: picked.requisiteId },
          include: { bank: true, trader: true },
        });

        if (!requisite) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const merchantFrac = percentToFraction(commissionPercent);
        const rtIn =
          isUahV2 && parserRate !== undefined
            ? rateTraderIn(parserRate, Number(requisite.trader.payinRate))
            : null;
        const raIn =
          isUahV2 && parserRate !== undefined
            ? rateAdminIn(parserRate, merchantFrac)
            : null;

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
            parserRate: rtIn !== null ? parserRate : undefined,
            rateTraderIn: rtIn ?? undefined,
            rateAdminIn: raIn ?? undefined,
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

        await tx.trafficDistributionLog.create({
          data: {
            traderId: requisite.traderId,
            payinOrderId: created.id,
            amount: created.amount,
            processingMethod: requisite.trader.processingMethod,
          },
        });

        await this.createPayinWebhookEntry(tx, created);

        return created;
      });

      const payinTxMs = Date.now() - txStarted;
      this.logPayinCreateTransactionMetrics(
        order,
        payinTxMs,
        'external_create_payin_order',
      );

      if (order.requisiteId) {
        void this.cascadeCoverageCache.invalidateCurrency(order.currency);
      }

      this.emitPayinOrderRealtime({
        id: order.id,
        traderId: order.traderId,
        merchantId: order.merchantId,
        status: order.status as PayInOrderStatus,
      });

      if (order.traderId) {
        void this.telegram.notifyNewPayin(order.traderId, {
          id: order.id,
          amount: Number(order.amount),
          currency: order.currency,
        });
      }

      return {
        order: payinOrderToOrderDto(order),
        form_uri: `${config.app.frontendUrl}/pay/${order.id}`,
      };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    } finally {
      if (redisCascadeLockId) {
        void this.cascadeCoverageCache.releaseRequisiteLock(redisCascadeLockId);
      }
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

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(updated);
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

    this.emitPayinOrderRealtime({
      id: refreshed.id,
      traderId: refreshed.traderId,
      merchantId: refreshed.merchantId,
      status: refreshed.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(refreshed);
  }

  // ─── External: order_info ───

  async getOrderInfo(merchantId: string, id?: string, requestId?: string): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, id, requestId);
    return payinOrderToOrderDto(order);
  }

  // ─── External: info ───

  async getInfo(merchantId: string): Promise<ProfileDto> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { balances: true },
    });

    const direction = await this.prisma.direction.findFirst({
      where: { type: DirectionType.PAYIN, isOnline: true },
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

    const merchantCommissionPct =
      await this.merchantDirectionsService.getEffectiveCommissionPercent(
        merchantId,
        DirectionType.PAYIN,
        dto.currency,
        dto.amount,
      );
    const commissionPercent = merchantCommissionPct ?? Number(direction.percentFee);
    const commission = dto.amount * commissionPercent / 100;
    const partnerAmount = dto.amount - commission;
    const autocloseAt = new Date(Date.now() + await this.getAutocloseMs());
    const isUahV2 = dto.currency === 'UAH';
    let parserRate: number | undefined;
    if (isUahV2) {
      try {
        parserRate = await this.exchangeRate.requireParserRateUaPerUsdt();
      } catch {
        throw new BadRequestException(
          'Exchange rate temporarily unavailable. Please try again shortly.',
        );
      }
    }

    let redisCascadeLockIdH2h: string | undefined;
    try {
      const txStarted = Date.now();
      const order = await this.prisma.$transaction(async (tx) => {
        const picked = await this.cascadeService.lockBestRequisiteForPayIn(tx, {
          amount: dto.amount,
          currency: dto.currency,
          parserRate,
          enforceUsdtCapacity: isUahV2,
        });

        if (!picked) {
          const merchantFracNr = percentToFraction(commissionPercent);
          const raInNr =
            isUahV2 && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracNr)
              : null;

          const createdNr = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              amount: dto.amount,
              currency: dto.currency,
              commissionPercent,
              commission,
              partnerAmount,
              rate: Number(direction.rate),
              parserRate: isUahV2 && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInNr ?? undefined,
              status: 'NO_REQUISITE',
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              redirectUrl: dto.redirect_url,
              autocloseAt,
              isH2h: true,
            },
            include: ORDER_INCLUDE,
          });

          await this.createPayinWebhookEntry(tx, createdNr);
          return createdNr;
        }

        if (picked.redisLockHeld) {
          redisCascadeLockIdH2h = picked.requisiteId;
        }

        const requisite = await tx.requisite.findUnique({
          where: { id: picked.requisiteId },
          include: { bank: true, trader: true },
        });

        if (!requisite) {
          throw new BadRequestException('PARAMETER_NOT_FOUND: No available requisite');
        }

        const merchantFrac = percentToFraction(commissionPercent);
        const rtIn =
          isUahV2 && parserRate !== undefined
            ? rateTraderIn(parserRate, Number(requisite.trader.payinRate))
            : null;
        const raIn =
          isUahV2 && parserRate !== undefined
            ? rateAdminIn(parserRate, merchantFrac)
            : null;

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
            parserRate: rtIn !== null ? parserRate : undefined,
            rateTraderIn: rtIn ?? undefined,
            rateAdminIn: raIn ?? undefined,
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

        await tx.trafficDistributionLog.create({
          data: {
            traderId: requisite.traderId,
            payinOrderId: created.id,
            amount: created.amount,
            processingMethod: requisite.trader.processingMethod,
          },
        });

        await this.createPayinWebhookEntry(tx, created);

        return created;
      });

      const payinTxMs = Date.now() - txStarted;
      this.logPayinCreateTransactionMetrics(order, payinTxMs, 'h2h_init_payin_order');

      if (order.requisiteId) {
        void this.cascadeCoverageCache.invalidateCurrency(order.currency);
      }

      this.emitPayinOrderRealtime({
        id: order.id,
        traderId: order.traderId,
        merchantId: order.merchantId,
        status: order.status as PayInOrderStatus,
      });

      if (order.traderId) {
        void this.telegram.notifyNewPayin(order.traderId, {
          id: order.id,
          amount: Number(order.amount),
          currency: order.currency,
        });
      }

      return { order: payinOrderToOrderDto(order) };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    } finally {
      if (redisCascadeLockIdH2h) {
        void this.cascadeCoverageCache.releaseRequisiteLock(redisCascadeLockIdH2h);
      }
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

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(updated);
  }

  // ─── Internal (Trader): list orders ───

  async getTraderOrders(traderId: string, filters: TraderOrderFiltersDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const statusResolution = this.resolveTraderListStatusFilter(filters);
    if (statusResolution === 'empty') {
      return { items: [], total: 0, page, limit };
    }

    const q = filters.search?.trim() ?? '';
    let idMatchIds: string[] | undefined;
    if (q && !uuidValidate(q)) {
      const compact = q.replace(/-/g, '');
      if (/^[0-9a-f]{8,}$/i.test(compact)) {
        const pattern = `%${compact}%`;
        const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id FROM payin_orders
            WHERE trader_id = CAST(${traderId} AS uuid)
              AND replace(id::text, '-', '') ILIKE ${pattern}
            LIMIT 500
          `,
        );
        idMatchIds = rows.map((r) => r.id);
      }
    }

    const baseWhere: Prisma.PayinOrderWhereInput = {
      traderId,
      ...(statusResolution ? { status: statusResolution } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
    };

    const searchOr = this.buildTraderOrderSearchOr(q, idMatchIds);
    const where: Prisma.PayinOrderWhereInput =
      searchOr.length > 0 ? { ...baseWhere, AND: [{ OR: searchOr }] } : baseWhere;

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
      items: items.map((o) => payinOrderToOrderDto(o)),
      total,
      page,
      limit,
    };
  }

  private resolveTraderListStatusFilter(
    filters: TraderOrderFiltersDto,
  ): Prisma.PayinOrderWhereInput['status'] | 'empty' | undefined {
    const scopeStatuses: PayInOrderStatus[] | undefined =
      filters.list === 'current'
        ? [...PAYIN_TRADER_CURRENT_STATUSES]
        : filters.list === 'history'
          ? [...PAYIN_TRADER_HISTORY_STATUSES]
          : undefined;

    if (filters.status && scopeStatuses) {
      if (!scopeStatuses.includes(filters.status)) return 'empty';
      return filters.status;
    }
    if (filters.status) return filters.status;
    if (scopeStatuses) return { in: scopeStatuses };
    return undefined;
  }

  private buildTraderOrderSearchOr(
    q: string,
    idMatchIds: string[] | undefined,
  ): Prisma.PayinOrderWhereInput[] {
    if (!q) return [];

    const or: Prisma.PayinOrderWhereInput[] = [
      { requestId: { contains: q, mode: 'insensitive' } },
      {
        requisite: {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { owner: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    ];

    if (uuidValidate(q)) {
      or.push({ id: q });
    } else if (idMatchIds && idMatchIds.length > 0) {
      or.push({ id: { in: idMatchIds } });
    }

    return or;
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

    const fromStatus = order.status as PayInOrderStatus;
    const paidOutcomes: PayInOrderStatus[] = [
      PayInOrderStatus.PAID,
      PayInOrderStatus.UNDERPAID,
      PayInOrderStatus.OVERPAID,
    ];

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: { status: targetStatus },
        include: ORDER_INCLUDE,
      });

      if (
        fromStatus === PayInOrderStatus.CANCELED &&
        order.requisiteId &&
        paidOutcomes.includes(targetStatus)
      ) {
        await this.requisitesService.incrementUsageInTransaction(
          tx,
          order.requisiteId,
          Number(order.amount),
        );
      }

      if (paidOutcomes.includes(targetStatus)) {
        const paidUah = actualAmount !== undefined ? actualAmount : orderAmount;
        await this.creditBalancesOnPaid(tx, order, paidUah);
      }

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(updated);
  }

  /**
   * Admin/owner pay-in status override: webhooks, balance credit on PAID, requisite usage when
   * re-resolving a canceled order to a paid outcome (usage was released on cancel).
   */
  async adminUpdatePayinOrderStatus(orderId: string, targetStatusRaw: string) {
    const targetStatus = targetStatusRaw.toUpperCase() as PayInOrderStatus;
    if (!(Object.values(PayInOrderStatus) as string[]).includes(targetStatus)) {
      throw new BadRequestException('Invalid pay-in status');
    }

    const order = await this.prisma.payinOrder.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const from = order.status as PayInOrderStatus;
    if (!isValidPayInTransition(from, targetStatus)) {
      throw new BadRequestException(`Invalid status transition: ${from} -> ${targetStatus}`);
    }

    const paidOutcomes: PayInOrderStatus[] = [
      PayInOrderStatus.PAID,
      PayInOrderStatus.UNDERPAID,
      PayInOrderStatus.OVERPAID,
    ];

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: { status: targetStatus as never },
      });

      if (
        from === PayInOrderStatus.CANCELED &&
        order.requisiteId &&
        paidOutcomes.includes(targetStatus)
      ) {
        await this.requisitesService.incrementUsageInTransaction(
          tx,
          order.requisiteId,
          Number(order.amount),
        );
      }

      if (paidOutcomes.includes(targetStatus)) {
        const paidUah = Number(order.amount);
        await this.creditBalancesOnPaid(tx, order, paidUah);
      }

      if (result.callbackUrl) {
        await tx.webhookOutbox.create({
          data: {
            payinOrderId: result.id,
            method: WebhookMethod.PAYIN_UPDATE_STATUS_ORDER as any,
            payloadJson: {
              id: result.id,
              order_id: result.requestId,
              order_status: result.status,
              amount: Number(result.amount),
            },
            callbackUrl: result.callbackUrl,
          },
        });
      }

      return result;
    });

    this.logger.log(`Admin updated pay-in order ${order.id}: ${from} -> ${targetStatus}`);
    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return updated;
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

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(updated);
  }

  /**
   * Pay-In creation transaction timing (includes cascade assignment + inserts). Use `event`:
   * `payin_create_order_tx_ms`, `payin_order_no_requisite`.
   */
  private logPayinCreateTransactionMetrics(
    order: OrderWithRelations,
    duration_ms: number,
    context: 'external_create_payin_order' | 'h2h_init_payin_order',
  ): void {
    this.logger.log({
      msg: 'payin.create_order_tx_complete',
      event: 'payin_create_order_tx_ms',
      duration_ms,
      status: order.status,
      currency: order.currency,
      amount: Number(order.amount),
      merchant_id: order.merchantId,
      context,
      has_requisite: order.requisiteId != null,
    });
    if (order.status === 'NO_REQUISITE') {
      this.logger.log({
        msg: 'payin.no_requisite_order',
        event: 'payin_order_no_requisite',
        currency: order.currency,
        amount: Number(order.amount),
        merchant_id: order.merchantId,
        context,
      });
    }
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

  /**
   * RISK NOTE: modifies merchant UAH balance, trader USDT balance (v2), and platform_income.
   * Legacy (non-UAH or missing parser snapshot): merchant +partnerAmount (scaled), trader +commission fiat.
   */
  private async creditBalancesOnPaid(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
    paidAmountUah: number,
  ): Promise<void> {
    const fullAmount = Number(order.amount);
    const scale = fullAmount > 0 ? paidAmountUah / fullAmount : 1;

    if (
      order.currency !== 'UAH' ||
      order.parserRate == null ||
      order.rateTraderIn == null ||
      order.rateAdminIn == null ||
      !order.traderId
    ) {
      const partnerAmount = Number(order.partnerAmount) * scale;
      const commission = Number(order.commission) * scale;

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

      if (commission > 0 && order.traderId) {
        const tid = order.traderId;
        await tx.traderBalance.upsert({
          where: {
            traderId_currency: {
              traderId: tid,
              currency: order.currency,
            },
          },
          create: {
            traderId: tid,
            currency: order.currency,
            amount: commission,
          },
          update: { amount: { increment: commission } },
        });

        await this.balanceTxService.record({
          traderId: tid,
          type: BalanceTransactionType.PAYIN_COMMISSION,
          amount: commission,
          currency: order.currency,
          referenceId: order.id,
          comment: `Pay-in commission for order ${order.id}`,
          tx,
        });
      }

      await tx.merchantBalanceTransaction.create({
        data: {
          merchantId: order.merchantId,
          type: MerchantBalanceTransactionType.PAYIN_CREDIT,
          amount: partnerAmount,
          currency: order.currency,
          referenceId: order.id,
          comment: `Pay-in credit (legacy) order ${order.id}`,
        },
      });

      this.logger.log(
        `Balances updated (legacy) for order ${order.id}: merchant +${partnerAmount}, trader +${commission} ${order.currency}`,
      );
      return;
    }

    const P = Number(order.parserRate);
    const rt = Number(order.rateTraderIn);
    const ra = Number(order.rateAdminIn);
    const merchantFrac = percentToFraction(Number(order.commissionPercent));
    const traderPayinFrac = Number(
      (await tx.traderProfile.findUniqueOrThrow({ where: { id: order.traderId } })).payinRate,
    );

    const merchantCredit = creditUahMerchantPayin(paidAmountUah, merchantFrac);
    const debitUsdt = debitUsdtPayin(paidAmountUah, rt);
    const marginUsdt = platformMarginUsdtPayin(paidAmountUah, rt, ra);
    const marginUah = platformMarginUah(marginUsdt, P);

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
        amount: merchantCredit,
      },
      update: { amount: { increment: merchantCredit } },
    });

    await tx.merchantBalanceTransaction.create({
      data: {
        merchantId: order.merchantId,
        type: MerchantBalanceTransactionType.PAYIN_CREDIT,
        amount: merchantCredit,
        currency: order.currency,
        referenceId: order.id,
        comment: `Pay-in credit order ${order.id}`,
      },
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
        amount: -debitUsdt,
      },
      update: { amount: { increment: -debitUsdt } },
    });

    await this.balanceTxService.record({
      traderId: order.traderId,
      type: BalanceTransactionType.PAYIN_DEBIT,
      amount: debitUsdt,
      currency: 'USDT',
      referenceId: order.id,
      comment: `Pay-in USDT debit for order ${order.id}`,
      tx,
    });

    await tx.platformIncome.create({
      data: {
        orderId: order.id,
        orderType: PlatformIncomeOrderType.PAYIN,
        merchantId: order.merchantId,
        traderId: order.traderId,
        orderAmountUah: paidAmountUah,
        parserRate: P,
        rateTrader: rt,
        rateAdmin: ra,
        traderRatePct: traderPayinFrac,
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeUah: marginUah,
      },
    });

    this.logger.log(
      `Balances updated (v2) for order ${order.id}: merchant +${merchantCredit} UAH, trader -${debitUsdt} USDT, platform +${marginUsdt} USDT`,
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
    return payinOrderToOrderDto(order);
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

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return payinOrderToOrderDto(updated);
  }
}

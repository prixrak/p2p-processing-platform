import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, DirectionType as PrismaDirectionType } from '@prisma/client';
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
  MAX_MULTIPART_FILES_PER_REQUEST,
  PAYIN_ORDER_REALTIME_EVENT_TYPE,
  PAYIN_TRADER_CURRENT_STATUSES,
  PAYIN_TRADER_HISTORY_STATUSES,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
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
  TraderProcessingMethod,
} from '@prisma/client';
import { config } from '@p2p/config';
import {
  creditFiatMerchantPayin,
  debitUsdtPayin,
  percentToFraction,
  platformMarginLocal,
  platformMarginUsdtPayin,
  rateAdminIn,
  rateTraderIn,
} from '@p2p/shared';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { assertAmountWithinDirectionMinMax } from '../../common/utils/direction-amount-limits.util';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import {
  PlatformSettingsService,
  PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES,
  PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES_FORK,
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
import { CurrenciesService } from '../currencies/currencies.service';
import {
  ORDER_INCLUDE,
  type OrderWithRelations,
  payinOrderToOrderDto,
} from './payin-order.mapper';
import { payinCompletedAtForHistoryStatus } from './payin-history-completion';

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
    private readonly currencies: CurrenciesService,
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

  private async getAutocloseMsForProcessingMethod(
    method: TraderProcessingMethod | null,
  ): Promise<number> {
    if (method === TraderProcessingMethod.FORK) {
      const setting = await this.platformSettings.findOne(
        PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES_FORK,
      );
      const minutes = Math.max(1, parseInt(setting.value, 10) || 10);
      return minutes * 60 * 1000;
    }
    const setting = await this.platformSettings.findOne(PLATFORM_SETTING_PAYIN_AUTOCLOSE_MINUTES);
    const minutes = Math.max(1, parseInt(setting.value, 10) || 10);
    return minutes * 60 * 1000;
  }

  // ─── External: upload_order ───

  async uploadOrder(merchantId: string, dto: UploadOrderDto): Promise<OrderResponseDto> {
    if (dto.callback_url) {
      await validateCallbackUrl(dto.callback_url);
    }
    const fiatCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);
    const direction = await this.findActiveDirection(dto.currency, DirectionType.PAYIN);

    assertAmountWithinDirectionMinMax(
      dto.amount,
      dto.currency,
      direction.minAmount,
      direction.maxAmount,
      'platform Pay-In direction',
    );

    await this.merchantDirectionsService.assertOrderAmountWithinActiveMerchantDirection(
      merchantId,
      PrismaDirectionType.PAYIN,
      dto.currency,
      dto.amount,
    );

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
    const payinUsesBinanceParserRate = dto.currency === 'UAH';
    let parserRate: number | undefined;
    if (payinUsesBinanceParserRate) {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
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
          enforceUsdtCapacity: payinUsesBinanceParserRate,
        });

        if (!picked) {
          const merchantFracNr = percentToFraction(commissionPercent);
          const raInNr =
            payinUsesBinanceParserRate && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracNr)
              : null;

          const autocloseMsNr = await this.getAutocloseMsForProcessingMethod(null);
          const autocloseAtNr = new Date(Date.now() + autocloseMsNr);

          const createdNr = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              amount: dto.amount,
              currencyId: fiatCurrencyId,
              commissionPercent,
              commission,
              partnerAmount,
              rate: 1,
              parserRate: payinUsesBinanceParserRate && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInNr ?? undefined,
              status: 'NO_REQUISITE',
              ...payinCompletedAtForHistoryStatus(PayInOrderStatus.NO_REQUISITE),
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtNr,
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
          payinUsesBinanceParserRate && parserRate !== undefined
            ? rateTraderIn(parserRate, Number(requisite.trader.payinRate))
            : null;
        const raIn =
          payinUsesBinanceParserRate && parserRate !== undefined
            ? rateAdminIn(parserRate, merchantFrac)
            : null;

        const autocloseMs = await this.getAutocloseMsForProcessingMethod(
          requisite.trader.processingMethod,
        );
        const autocloseAtAssigned = new Date(Date.now() + autocloseMs);

        const created = await tx.payinOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            traderId: requisite.traderId,
            requisiteId: requisite.id,
            amount: dto.amount,
            currencyId: fiatCurrencyId,
            commissionPercent,
            commission,
            partnerAmount,
            rate: 1,
            parserRate: rtIn !== null ? parserRate : undefined,
            rateTraderIn: rtIn ?? undefined,
            rateAdminIn: raIn ?? undefined,
            status: 'NEW',
            userFullName: dto.user_full_name,
            userIdExternal: dto.user_id,
            callbackUrl: dto.callback_url,
            traderProcessingMethod: requisite.trader.processingMethod,
            autocloseAt: autocloseAtAssigned,
            isH2h: false,
          },
          include: ORDER_INCLUDE,
        });

        await this.requisitesService.incrementUsageInTransaction(tx, requisite.id, dto.amount);

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
        void this.cascadeCoverageCache.invalidateCurrency(order.currency.code);
        void this.cascadeCoverageCache.recordRequisiteAssignment(
          order.requisiteId,
          order.id,
        );
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
          currency: order.currency.code,
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

    const nextStatus = dto.status;
    if (!nextStatus) {
      throw new BadRequestException('Status is required');
    }

    const allowedMerchantStatuses = [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED];
    if (!allowedMerchantStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Merchants can only set VERIFIED or CANCELED`);
    }

    if (!isValidPayInTransition(order.status as PayInOrderStatus, nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${nextStatus}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          ...(nextStatus === PayInOrderStatus.VERIFIED ? { confirmedAt: new Date() } : {}),
          ...payinCompletedAtForHistoryStatus(nextStatus),
        },
        include: ORDER_INCLUDE,
      });

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    if (nextStatus === PayInOrderStatus.CANCELED && order.requisiteId) {
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

    if (files.length > MAX_MULTIPART_FILES_PER_REQUEST) {
      throw new BadRequestException(
        `At most ${MAX_MULTIPART_FILES_PER_REQUEST} proof files allowed per request`,
      );
    }

    const fileIds = await this.filesService.saveFiles(files);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === PayInOrderStatus.VERIFIED ? { confirmedAt: new Date() } : {}),
          ...payinCompletedAtForHistoryStatus(status),
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
      include: { balances: { include: { currency: true } } },
    });

    const direction = await this.prisma.direction.findFirst({
      where: { type: DirectionType.PAYIN, isOnline: true },
    });

    const balances: Record<string, number> = {};
    for (const b of merchant.balances) {
      balances[b.currency.code] = Number(b.amount);
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
            rate: 1,
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
    const fiatCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);
    const direction = await this.findActiveDirection(dto.currency, DirectionType.PAYIN);

    assertAmountWithinDirectionMinMax(
      dto.amount,
      dto.currency,
      direction.minAmount,
      direction.maxAmount,
      'platform Pay-In direction',
    );

    await this.merchantDirectionsService.assertOrderAmountWithinActiveMerchantDirection(
      merchantId,
      PrismaDirectionType.PAYIN,
      dto.currency,
      dto.amount,
    );

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
    const payinUsesBinanceParserRate = dto.currency === 'UAH';
    let parserRate: number | undefined;
    if (payinUsesBinanceParserRate) {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt('UAH');
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
          enforceUsdtCapacity: payinUsesBinanceParserRate,
        });

        if (!picked) {
          const merchantFracNr = percentToFraction(commissionPercent);
          const raInNr =
            payinUsesBinanceParserRate && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracNr)
              : null;

          const autocloseMsNr = await this.getAutocloseMsForProcessingMethod(null);
          const autocloseAtNr = new Date(Date.now() + autocloseMsNr);

          const createdNr = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              amount: dto.amount,
              currencyId: fiatCurrencyId,
              commissionPercent,
              commission,
              partnerAmount,
              rate: 1,
              parserRate: payinUsesBinanceParserRate && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInNr ?? undefined,
              status: 'NO_REQUISITE',
              ...payinCompletedAtForHistoryStatus(PayInOrderStatus.NO_REQUISITE),
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              redirectUrl: dto.redirect_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtNr,
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
          payinUsesBinanceParserRate && parserRate !== undefined
            ? rateTraderIn(parserRate, Number(requisite.trader.payinRate))
            : null;
        const raIn =
          payinUsesBinanceParserRate && parserRate !== undefined
            ? rateAdminIn(parserRate, merchantFrac)
            : null;

        const autocloseMs = await this.getAutocloseMsForProcessingMethod(
          requisite.trader.processingMethod,
        );
        const autocloseAtAssigned = new Date(Date.now() + autocloseMs);

        const created = await tx.payinOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            traderId: requisite.traderId,
            requisiteId: requisite.id,
            amount: dto.amount,
            currencyId: fiatCurrencyId,
            commissionPercent,
            commission,
            partnerAmount,
            rate: 1,
            parserRate: rtIn !== null ? parserRate : undefined,
            rateTraderIn: rtIn ?? undefined,
            rateAdminIn: raIn ?? undefined,
            status: 'NEW',
            userFullName: dto.user_full_name,
            userIdExternal: dto.user_id,
            callbackUrl: dto.callback_url,
            redirectUrl: dto.redirect_url,
            traderProcessingMethod: requisite.trader.processingMethod,
            autocloseAt: autocloseAtAssigned,
            isH2h: true,
          },
          include: ORDER_INCLUDE,
        });

        await this.requisitesService.incrementUsageInTransaction(tx, requisite.id, dto.amount);

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
        void this.cascadeCoverageCache.invalidateCurrency(order.currency.code);
        void this.cascadeCoverageCache.recordRequisiteAssignment(
          order.requisiteId,
          order.id,
        );
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
          currency: order.currency.code,
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

    if (files.length > MAX_MULTIPART_FILES_PER_REQUEST) {
      throw new BadRequestException(
        `At most ${MAX_MULTIPART_FILES_PER_REQUEST} proof files allowed per request`,
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
        data: {
          status: 'APPEAL',
          ...payinCompletedAtForHistoryStatus(PayInOrderStatus.APPEAL),
        },
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

  /**
   * FORK Pay-In: store exchange/counterparty reference and optional chat screenshots (MVP).
   */
  async traderSubmitForkVerification(
    traderId: string,
    userId: string,
    orderId: string,
    exchangeReferenceRaw: string,
    files: UploadedFile[],
  ): Promise<OrderDto> {
    const exchangeReference = (exchangeReferenceRaw ?? '').trim();
    if (!exchangeReference) {
      throw new BadRequestException('exchange_reference is required');
    }
    if (exchangeReference.length > 512) {
      throw new BadRequestException('exchange_reference must be at most 512 characters');
    }

    const fileList = files ?? [];
    if (fileList.length > MAX_MULTIPART_FILES_PER_REQUEST) {
      throw new BadRequestException(`At most ${MAX_MULTIPART_FILES_PER_REQUEST} files`);
    }

    const orderProbe = await this.prisma.payinOrder.findFirst({
      where: { id: orderId, traderId },
      select: { id: true, status: true, traderProcessingMethod: true },
    });
    if (!orderProbe) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    const st = orderProbe.status as PayInOrderStatus;
    if (!PAYIN_TRADER_CURRENT_STATUSES.includes(st)) {
      throw new BadRequestException(
        'Fork verification is only allowed while the order is in an active trader workflow status',
      );
    }
    if (orderProbe.traderProcessingMethod !== TraderProcessingMethod.FORK) {
      throw new BadRequestException(
        'Fork verification is only available for orders assigned on FORK routing',
      );
    }

    const newFileIds =
      fileList.length > 0 ? await this.filesService.saveFiles(fileList, userId) : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.payinOrder.update({
        where: { id: orderId },
        data: { forkExchangeReference: exchangeReference },
      });
      if (newFileIds.length > 0) {
        await tx.payinForkChatProof.createMany({
          data: newFileIds.map((fileId) => ({ payinOrderId: orderId, fileId })),
        });
      }
    });

    const updated = await this.prisma.payinOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    this.logger.log({
      msg: 'payin.fork_verification_submitted',
      order_id: orderId,
      trader_id: traderId,
      chat_proof_files_added: newFileIds.length,
      reference_len: exchangeReference.length,
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
      ...(filters.currency
        ? { currency: { code: filters.currency.trim().toUpperCase() } }
        : {}),
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
        data: {
          status: targetStatus,
          ...payinCompletedAtForHistoryStatus(targetStatus),
        },
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
        const paidLocal = actualAmount !== undefined ? actualAmount : orderAmount;
        await this.creditBalancesOnPaid(tx, order, paidLocal);
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
        data: {
          status: targetStatus as never,
          ...payinCompletedAtForHistoryStatus(targetStatus),
        },
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
        const paidLocal = Number(order.amount);
        await this.creditBalancesOnPaid(tx, order, paidLocal);
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
        data: {
          status: 'CANCELED',
          ...payinCompletedAtForHistoryStatus(PayInOrderStatus.CANCELED),
        },
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
   * Cancel Pay-In assignments that still reference a disabled trader profile.
   * Mirrors trader cancel: requisite usage is released and merchant webhooks carry CANCELED.
   *
   * **Risk:** Cancels merchant-visible orders currently in trader current buckets (PENDING/NEW/VERIFIED).
   */
  async cancelOpenAssignmentsForDeactivatedTrader(traderProfileId: string): Promise<number> {
    const statuses: PayInOrderStatus[] = [
      PayInOrderStatus.PENDING,
      PayInOrderStatus.NEW,
      PayInOrderStatus.VERIFIED,
    ];
    const orders = await this.prisma.payinOrder.findMany({
      where: { traderId: traderProfileId, status: { in: statuses } },
      include: ORDER_INCLUDE,
    });
    if (orders.length === 0) return 0;

    const canceled: OrderWithRelations[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const order of orders) {
        if (!isValidPayInTransition(order.status as PayInOrderStatus, PayInOrderStatus.CANCELED)) {
          this.logger.warn(
            `Pay-In ${order.id}: skip cancel on trader deactivation (invalid transition ${order.status} -> CANCELED)`,
          );
          continue;
        }

        const result = await tx.payinOrder.update({
          where: { id: order.id },
          data: {
            status: 'CANCELED',
            ...payinCompletedAtForHistoryStatus(PayInOrderStatus.CANCELED),
          },
          include: ORDER_INCLUDE,
        });

        await this.createPayinWebhookEntry(tx, result);
        canceled.push(result);
      }
    });

    const canceledIds = new Set(canceled.map((o) => o.id));
    for (const snapshot of orders) {
      if (!canceledIds.has(snapshot.id)) continue;
      if (snapshot.requisiteId) {
        await this.requisitesService.releaseUsage(snapshot.requisiteId, Number(snapshot.amount));
      }
      const row = canceled.find((c) => c.id === snapshot.id)!;
      this.emitPayinOrderRealtime({
        id: row.id,
        traderId: row.traderId,
        merchantId: row.merchantId,
        status: row.status as PayInOrderStatus,
      });
    }

    this.logger.log(
      `Pay-In: canceled ${canceled.length} open order(s) for deactivated trader profile ${traderProfileId}`,
    );
    return canceled.length;
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
      currency: order.currency.code,
      amount: Number(order.amount),
      merchant_id: order.merchantId,
      context,
      has_requisite: order.requisiteId != null,
      trader_processing_method: order.traderProcessingMethod ?? null,
    });
    if (order.status === 'NO_REQUISITE') {
      this.logger.log({
        msg: 'payin.no_requisite_order',
        event: 'payin_order_no_requisite',
        currency: order.currency.code,
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
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(currency);
    const direction = await this.prisma.direction.findFirst({
      where: { type, fromCurrencyId: currencyId, isOnline: true },
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
          ...(order.traderProcessingMethod != null
            ? { trader_processing_method: order.traderProcessingMethod }
            : {}),
        },
        callbackUrl: order.callbackUrl,
      },
    });
  }

  /**
   * RISK NOTE: modifies merchant fiat balance, trader USDT balance, and platform_income.
   * Requires UAH Pay-In v2 rate snapshots and an assigned trader; no non-v2 settlement path.
   */
  private async creditBalancesOnPaid(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
    paidAmountLocal: number,
  ): Promise<void> {
    if (
      order.currency.code !== 'UAH' ||
      order.parserRate == null ||
      order.rateTraderIn == null ||
      order.rateAdminIn == null ||
      !order.traderId
    ) {
      throw new BadRequestException(
        'Pay-In settlement requires UAH with parser rate snapshots (rateTraderIn, rateAdminIn) and an assigned trader.',
      );
    }

    const usdtId = await this.currencies.getUsdtCurrencyId();

    const P = Number(order.parserRate);
    const rt = Number(order.rateTraderIn);
    const ra = Number(order.rateAdminIn);
    const merchantFrac = percentToFraction(Number(order.commissionPercent));
    const traderPayinFrac = Number(
      (await tx.traderProfile.findUniqueOrThrow({ where: { id: order.traderId } })).payinRate,
    );

    const merchantCredit = creditFiatMerchantPayin(paidAmountLocal, merchantFrac);
    const debitUsdt = debitUsdtPayin(paidAmountLocal, rt);
    const marginUsdt = platformMarginUsdtPayin(paidAmountLocal, rt, ra);
    const marginLocal = platformMarginLocal(marginUsdt, P);

    await tx.merchantBalance.upsert({
      where: {
        merchantId_currencyId: {
          merchantId: order.merchantId,
          currencyId: order.currencyId,
        },
      },
      create: {
        merchantId: order.merchantId,
        currencyId: order.currencyId,
        amount: merchantCredit,
      },
      update: { amount: { increment: merchantCredit } },
    });

    await tx.merchantBalanceTransaction.create({
      data: {
        merchantId: order.merchantId,
        type: MerchantBalanceTransactionType.PAYIN_CREDIT,
        amount: merchantCredit,
        currencyId: order.currencyId,
        referenceId: order.id,
        comment: `Pay-in credit order ${order.id}`,
      },
    });

    await tx.traderBalance.upsert({
      where: {
        traderId_currencyId: {
          traderId: order.traderId,
          currencyId: usdtId,
        },
      },
      create: {
        traderId: order.traderId,
        currencyId: usdtId,
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
        orderAmountLocal: paidAmountLocal,
        parserRate: P,
        rateTrader: rt,
        rateAdmin: ra,
        traderRatePct: traderPayinFrac,
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeLocal: marginLocal,
      },
    });

    this.logger.log(
      `Balances updated for order ${order.id}: merchant +${merchantCredit} ${order.currency.code}, trader -${debitUsdt} USDT, platform +${marginUsdt} USDT`,
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

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
  AppealStatus,
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
  PAYIN_PAID_OUTCOME_STATUSES,
} from '@p2p/shared';
import type {
  OrderDto,
  OrderResponseDto,
  H2HOrderResponseDto,
  ProfileDto,
  PayInCheckAvailabilityResponseDto,
  PaymentBankApiDto,
  TraderPayInOrderDto,
} from '@p2p/shared';
import {
  BalanceTransactionType,
  CascadeAssignmentLevel,
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
import { buildPayinOrderSearchOr, normalizeOrderListSearch } from '../../common/order-search-where';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { assertAmountWithinDirectionMinMax } from '../../common/utils/direction-amount-limits.util';
import { buildMerchantProfileDto } from '../../common/utils/merchant-profile.helper';
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
  payinOrderToTraderPayInOrderDto,
} from './payin-order.mapper';
import { payinCompletedAtForHistoryStatus } from './payin-history-completion';
import type { ExternalOrderCreationMeta } from '../../common/utils/partner-request-meta';
import { randomUUID } from 'node:crypto';
import { PayinProviderService } from '../payin-provider/payin-provider.service';
import { AuditService } from '../audit/audit.service';
import {
  fetchOrderStatusHistory,
  initialOrderStatusAuditFrom,
  OrderStatusHistoryEntity,
  recordOrderStatusChange,
  withOrderStatusHistoryFallback,
  type OrderStatusHistoryEntry,
} from '../../common/order-status-history/order-status-history';

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
    private readonly payinProviderService: PayinProviderService,
    private readonly audit: AuditService,
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

  async uploadOrder(
    merchantId: string,
    dto: UploadOrderDto,
    meta?: ExternalOrderCreationMeta,
  ): Promise<OrderResponseDto> {
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
    await this.merchantDirectionsService.assertOrderAmountNotBlocked(
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
    const providerIdempotencyKey = randomUUID();
    try {
      const txStarted = Date.now();
      const order = await this.prisma.$transaction(async (tx) => {
        const picked = await this.cascadeService.lockBestRequisiteForPayIn(tx, {
          amount: dto.amount,
          currency: dto.currency,
          parserRate,
          enforceUsdtCapacity: payinUsesBinanceParserRate,
          providerIdempotencyKey,
          attemptProviderTier: this.makePayinProviderTierCallback(),
        });

        if (picked.kind === 'none') {
          await this.logProviderTierStub(tx, dto.currency, dto.amount);

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
              noRequisiteReason: picked.reason,
              noRequisiteDetail: picked.detail?.slice(0, 512),
              ...payinCompletedAtForHistoryStatus(PayInOrderStatus.NO_REQUISITE),
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtNr,
              isH2h: false,
              partnerIp: meta?.partnerIp ?? undefined,
              externalApiPath: meta?.externalApiPath ?? undefined,
            },
            include: ORDER_INCLUDE,
          });

          await this.createPayinWebhookEntry(tx, createdNr);
          return createdNr;
        }

        if (picked.kind === 'provider') {
          const merchantFracPv = percentToFraction(commissionPercent);
          const raInPv =
            payinUsesBinanceParserRate && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracPv)
              : null;
          const autocloseMsPv = await this.getAutocloseMsForProcessingMethod(null);
          const autocloseAtPv = new Date(Date.now() + autocloseMsPv);

          const createdPv = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              providerExternalRef: picked.providerExternalRef,
              amount: dto.amount,
              currencyId: fiatCurrencyId,
              commissionPercent,
              commission,
              partnerAmount,
              rate: 1,
              parserRate:
                payinUsesBinanceParserRate && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInPv ?? undefined,
              status: 'PENDING',
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtPv,
              isH2h: false,
              partnerIp: meta?.partnerIp ?? undefined,
              externalApiPath: meta?.externalApiPath ?? undefined,
            },
            include: ORDER_INCLUDE,
          });

          await this.writePayinOrderAssignmentLog(tx, {
            payinOrderId: createdPv.id,
            amount: dto.amount,
            currencyCode: dto.currency.trim().toUpperCase(),
            primary: this.prismaCascadeAssignmentLevel(picked.primaryCascadeLevel),
            final: CascadeAssignmentLevel.PROVIDER,
          });

          await this.createPayinWebhookEntry(tx, createdPv);
          return createdPv;
        }

        if (picked.kind === 'trader' && picked.redisLockHeld) {
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
            partnerIp: meta?.partnerIp ?? undefined,
            externalApiPath: meta?.externalApiPath ?? undefined,
          },
          include: ORDER_INCLUDE,
        });

        await this.requisitesService.incrementUsageInTransaction(tx, requisite.id, dto.amount, {
          recordPayInCascadeAssignment: true,
        });

        await tx.trafficDistributionLog.create({
          data: {
            traderId: requisite.traderId,
            payinOrderId: created.id,
            amount: created.amount,
            processingMethod: requisite.trader.processingMethod,
            cascadeAssignmentLevel: this.prismaCascadeAssignmentLevel(picked.landedCascadeLevel),
            cascadePrimaryAssignmentLevel: this.prismaCascadeAssignmentLevel(
              picked.primaryCascadeLevel,
            ),
          },
        });

        await this.writePayinOrderAssignmentLog(tx, {
          payinOrderId: created.id,
          amount: dto.amount,
          currencyCode: dto.currency.trim().toUpperCase(),
          primary: this.prismaCascadeAssignmentLevel(picked.primaryCascadeLevel),
          final: this.prismaCascadeAssignmentLevel(picked.landedCascadeLevel),
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

      this.logPayinOrderCreated(order.id, order.status as PayInOrderStatus);

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
    return this.applyMerchantStatusUpdate(order, dto.status);
  }

  // ─── External: update_order_with_proofs ───

  async updateOrderWithProofs(
    merchantId: string,
    orderId: string,
    status: PayInOrderStatus,
    files: UploadedFile[],
  ): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, orderId, undefined);

    if (files.length > MAX_MULTIPART_FILES_PER_REQUEST) {
      throw new BadRequestException(
        `At most ${MAX_MULTIPART_FILES_PER_REQUEST} proof files allowed per request`,
      );
    }

    const fileIds = files.length > 0 ? await this.filesService.saveFiles(files) : [];

    return this.applyMerchantStatusUpdate(order, status, { payerPaymentProofFileIds: fileIds });
  }

  /**
   * Shared merchant-side status update kernel for `update_order` (no proofs) and
   * `update_order_with_proofs` (optional payer receipt attachment).
   *
   * Validates allowed transitions, persists status + `confirmedAt`, stores payer payment proofs
   * when file ids are supplied (same store as the public payment page — not dispute appeals),
   * emits the merchant webhook, and releases requisite usage on CANCELED.
   */
  private async applyMerchantStatusUpdate(
    order: OrderWithRelations,
    nextStatus: PayInOrderStatus,
    opts: { payerPaymentProofFileIds?: string[] } = {},
  ): Promise<OrderDto> {
    const allowedMerchantStatuses = [PayInOrderStatus.VERIFIED, PayInOrderStatus.CANCELED];
    if (!allowedMerchantStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Merchants can only set VERIFIED or CANCELED`);
    }

    if (!isValidPayInTransition(order.status as PayInOrderStatus, nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> ${nextStatus}`,
      );
    }

    const fileIds = opts.payerPaymentProofFileIds ?? [];
    const hasProofs = fileIds.length > 0;

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

      if (hasProofs) {
        await tx.payinPayerPaymentProof.createMany({
          data: fileIds.map((fileId) => ({ payinOrderId: order.id, fileId })),
        });
      }

      await this.createPayinWebhookEntry(tx, result);

      return result;
    });

    if (nextStatus === PayInOrderStatus.CANCELED && order.requisiteId) {
      await this.requisitesService.releaseUsage(order.requisiteId, Number(order.amount));
    }

    // Re-read after the transaction so freshly attached payer proofs are included in the DTO.
    const finalRow = hasProofs
      ? await this.prisma.payinOrder.findUniqueOrThrow({
          where: { id: updated.id },
          include: ORDER_INCLUDE,
        })
      : updated;

    this.emitPayinOrderRealtime({
      id: finalRow.id,
      traderId: finalRow.traderId,
      merchantId: finalRow.merchantId,
      status: finalRow.status as PayInOrderStatus,
    });

    void this.logPayinStatusChange(order.id, order.status, nextStatus, {
      actorRole: 'MERCHANT',
      note: hasProofs ? 'Merchant update with payer payment receipt(s)' : undefined,
    });

    return payinOrderToOrderDto(finalRow);
  }

  // ─── External: order_info ───

  async getOrderInfo(merchantId: string, id?: string, requestId?: string): Promise<OrderDto> {
    const order = await this.resolveOrder(merchantId, id, requestId);
    return payinOrderToOrderDto(order);
  }

  // ─── External: info ───

  async getInfo(merchantId: string): Promise<ProfileDto> {
    return buildMerchantProfileDto(this.prisma, merchantId, DirectionType.PAYIN);
  }

  // ─── External: h2h_init ───

  async h2hInit(
    merchantId: string,
    dto: H2hInitDto,
    meta?: ExternalOrderCreationMeta,
  ): Promise<H2HOrderResponseDto> {
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
    await this.merchantDirectionsService.assertOrderAmountNotBlocked(
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
    const providerIdempotencyKeyH2h = randomUUID();
    try {
      const txStarted = Date.now();
      const order = await this.prisma.$transaction(async (tx) => {
        const picked = await this.cascadeService.lockBestRequisiteForPayIn(tx, {
          amount: dto.amount,
          currency: dto.currency,
          parserRate,
          enforceUsdtCapacity: payinUsesBinanceParserRate,
          providerIdempotencyKey: providerIdempotencyKeyH2h,
          attemptProviderTier: this.makePayinProviderTierCallback(),
        });

        if (picked.kind === 'none') {
          await this.logProviderTierStub(tx, dto.currency, dto.amount);

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
              noRequisiteReason: picked.reason,
              noRequisiteDetail: picked.detail?.slice(0, 512),
              ...payinCompletedAtForHistoryStatus(PayInOrderStatus.NO_REQUISITE),
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              redirectUrl: dto.redirect_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtNr,
              isH2h: true,
              partnerIp: meta?.partnerIp ?? undefined,
              externalApiPath: meta?.externalApiPath ?? undefined,
            },
            include: ORDER_INCLUDE,
          });

          await this.createPayinWebhookEntry(tx, createdNr);
          return createdNr;
        }

        if (picked.kind === 'provider') {
          const merchantFracPv = percentToFraction(commissionPercent);
          const raInPv =
            payinUsesBinanceParserRate && parserRate !== undefined
              ? rateAdminIn(parserRate, merchantFracPv)
              : null;
          const autocloseMsPv = await this.getAutocloseMsForProcessingMethod(null);
          const autocloseAtPv = new Date(Date.now() + autocloseMsPv);

          const createdPv = await tx.payinOrder.create({
            data: {
              requestId: dto.request_id,
              merchantId,
              traderId: null,
              requisiteId: null,
              providerExternalRef: picked.providerExternalRef,
              amount: dto.amount,
              currencyId: fiatCurrencyId,
              commissionPercent,
              commission,
              partnerAmount,
              rate: 1,
              parserRate:
                payinUsesBinanceParserRate && parserRate !== undefined ? parserRate : undefined,
              rateTraderIn: undefined,
              rateAdminIn: raInPv ?? undefined,
              status: 'PENDING',
              userFullName: dto.user_full_name,
              userIdExternal: dto.user_id,
              callbackUrl: dto.callback_url,
              redirectUrl: dto.redirect_url,
              traderProcessingMethod: null,
              autocloseAt: autocloseAtPv,
              isH2h: true,
              partnerIp: meta?.partnerIp ?? undefined,
              externalApiPath: meta?.externalApiPath ?? undefined,
            },
            include: ORDER_INCLUDE,
          });

          await this.writePayinOrderAssignmentLog(tx, {
            payinOrderId: createdPv.id,
            amount: dto.amount,
            currencyCode: dto.currency.trim().toUpperCase(),
            primary: this.prismaCascadeAssignmentLevel(picked.primaryCascadeLevel),
            final: CascadeAssignmentLevel.PROVIDER,
          });

          await this.createPayinWebhookEntry(tx, createdPv);
          return createdPv;
        }

        if (picked.kind === 'trader' && picked.redisLockHeld) {
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
            partnerIp: meta?.partnerIp ?? undefined,
            externalApiPath: meta?.externalApiPath ?? undefined,
          },
          include: ORDER_INCLUDE,
        });

        await this.requisitesService.incrementUsageInTransaction(tx, requisite.id, dto.amount, {
          recordPayInCascadeAssignment: true,
        });

        await tx.trafficDistributionLog.create({
          data: {
            traderId: requisite.traderId,
            payinOrderId: created.id,
            amount: created.amount,
            processingMethod: requisite.trader.processingMethod,
            cascadeAssignmentLevel: this.prismaCascadeAssignmentLevel(picked.landedCascadeLevel),
            cascadePrimaryAssignmentLevel: this.prismaCascadeAssignmentLevel(
              picked.primaryCascadeLevel,
            ),
          },
        });

        await this.writePayinOrderAssignmentLog(tx, {
          payinOrderId: created.id,
          amount: dto.amount,
          currencyCode: dto.currency.trim().toUpperCase(),
          primary: this.prismaCascadeAssignmentLevel(picked.primaryCascadeLevel),
          final: this.prismaCascadeAssignmentLevel(picked.landedCascadeLevel),
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

      this.logPayinOrderCreated(order.id, order.status as PayInOrderStatus);

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

    const fromAppealStatus = order.status as PayInOrderStatus;
    const wasPaidBeforeAppeal =
      PAYIN_PAID_OUTCOME_STATUSES.includes(fromAppealStatus);
    const prevReceivedForAppeal =
      order.receivedFiatAmount != null ? Number(order.receivedFiatAmount) : 0;

    const { updated, appealId } = await this.prisma.$transaction(async (tx) => {
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

      if (
        order.requisiteId &&
        wasPaidBeforeAppeal &&
        prevReceivedForAppeal > 0
      ) {
        await this.requisitesService.adjustConfirmedPayinVolumeInTransaction(
          tx,
          order.requisiteId,
          -prevReceivedForAppeal,
        );
      }

      const result = await tx.payinOrder.update({
        where: { id: order.id },
        data: {
          status: 'APPEAL',
          receivedFiatAmount: null,
          ...payinCompletedAtForHistoryStatus(PayInOrderStatus.APPEAL),
        },
        include: ORDER_INCLUDE,
      });

      await this.createPayinWebhookEntry(tx, result);

      return { updated: result, appealId: appeal.id };
    });

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    if (updated.traderId) {
      void this.telegram
        .notifyAppeal(updated.traderId, {
          id: appealId,
          orderId: order.id,
          paidAmount: dto.paid_amount,
        })
        .catch(() => undefined);
    }

    void this.logPayinStatusChange(order.id, fromAppealStatus, updated.status, {
      actorRole: 'MERCHANT',
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
  ): Promise<TraderPayInOrderDto> {
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

    return payinOrderToTraderPayInOrderDto(updated);
  }

  // ─── Internal (Trader): list orders ───

  async getTraderOrders(traderId: string, filters: TraderOrderFiltersDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const statusResolution = this.resolveTraderListStatusFilter(filters);
    if (statusResolution === 'empty') {
      return { items: [], total: 0, page, limit };
    }

    const q = normalizeOrderListSearch(filters.search) ?? '';
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
      items: items.map((o) => payinOrderToTraderPayInOrderDto(o)),
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

    const or = buildPayinOrderSearchOr(q) as Prisma.PayinOrderWhereInput[];

    if (!uuidValidate(q) && idMatchIds && idMatchIds.length > 0) {
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

    const orderAmount = Number(order.amount);
    let targetStatus: PayInOrderStatus;
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

    const paidCredit = actualAmount !== undefined ? actualAmount : orderAmount;

    const updated = await this.prisma.$transaction((tx) =>
      this.applyPayinPaidTransitionTx(tx, { order, targetStatus, paidCredit }),
    );

    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    void this.logPayinStatusChange(order.id, order.status, updated.status, {
      actorRole: 'TRADER',
    });

    return payinOrderToOrderDto(updated);
  }

  /**
   * Closes an OPEN appeal and moves the Pay-In order out of APPEAL (paid outcomes or CANCELED).
   * Used by AppealsService after RBAC checks — single DB transaction with webhook + balance logic.
   *
   * RISK: Mutates merchant/trader balances and requisite volume when resolving to PAID variants.
   */
  async settlePayInOrderWhenAppealCloses(
    appealId: string,
    decision: AppealStatus.RESOLVED | AppealStatus.REJECTED,
    actualAmount?: number,
  ): Promise<OrderWithRelations> {
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const appealRow = await tx.appeal.findUnique({ where: { id: appealId } });
      if (!appealRow) throw new NotFoundException('Appeal not found');
      if (appealRow.status !== 'OPEN') {
        throw new BadRequestException(`Appeal is already ${appealRow.status}`);
      }

      const appealPaidUpdate =
        decision === AppealStatus.RESOLVED && actualAmount !== undefined
          ? { paidAmount: actualAmount }
          : {};

      await tx.appeal.update({
        where: { id: appealId },
        data: { status: decision as never, ...appealPaidUpdate },
      });

      const order = await tx.payinOrder.findUnique({
        where: { id: appealRow.payinOrderId },
        include: ORDER_INCLUDE,
      });

      if (!order) throw new NotFoundException('Pay-in order not found');

      const cur = order.status as PayInOrderStatus;
      if (cur !== PayInOrderStatus.APPEAL) {
        throw new BadRequestException(
          `Pay-In order must be APPEAL to settle from appeal, got ${order.status}`,
        );
      }

      if (decision === AppealStatus.REJECTED) {
        if (!isValidPayInTransition(cur, PayInOrderStatus.CANCELED)) {
          throw new BadRequestException(`Cannot transition ${cur} -> CANCELED`);
        }

        const result = await tx.payinOrder.update({
          where: { id: order.id },
          data: {
            status: 'CANCELED',
            receivedFiatAmount: null,
            ...payinCompletedAtForHistoryStatus(PayInOrderStatus.CANCELED),
          },
          include: ORDER_INCLUDE,
        });

        await this.createPayinWebhookEntry(tx, result);
        return result;
      }

      const reported =
        actualAmount !== undefined ? actualAmount : Number(appealRow.paidAmount);
      const orderAmt = Number(order.amount);
      let targetStatus: PayInOrderStatus;
      if (reported === orderAmt) {
        targetStatus = PayInOrderStatus.PAID;
      } else if (reported < orderAmt) {
        targetStatus = PayInOrderStatus.UNDERPAID;
      } else {
        targetStatus = PayInOrderStatus.OVERPAID;
      }

      if (!isValidPayInTransition(cur, targetStatus)) {
        throw new BadRequestException(`Cannot transition ${cur} -> ${targetStatus}`);
      }

      return this.applyPayinPaidTransitionTx(tx, {
        order,
        targetStatus,
        paidCredit: reported,
      });
    });

    if (decision === AppealStatus.REJECTED && updatedOrder.requisiteId) {
      await this.requisitesService.releaseUsage(updatedOrder.requisiteId, Number(updatedOrder.amount));
    }

    this.emitPayinOrderRealtime({
      id: updatedOrder.id,
      traderId: updatedOrder.traderId,
      merchantId: updatedOrder.merchantId,
      status: updatedOrder.status as PayInOrderStatus,
    });

    void this.logPayinStatusChange(
      updatedOrder.id,
      PayInOrderStatus.APPEAL,
      updatedOrder.status,
      { actorRole: 'SUPPORT' },
    );

    this.logger.log({
      msg: 'payin.appeal_settlement',
      appeal_id: appealId,
      decision,
      payin_order_id: updatedOrder.id,
      order_status: updatedOrder.status,
    });

    return updatedOrder;
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

    const paidCredit = Number(order.amount);

    const updated = await this.prisma.$transaction((tx) =>
      this.applyPayinPaidTransitionTx(tx, { order, targetStatus, paidCredit }),
    );

    this.logger.log(`Admin updated pay-in order ${order.id}: ${from} -> ${targetStatus}`);
    this.emitPayinOrderRealtime({
      id: updated.id,
      traderId: updated.traderId,
      merchantId: updated.merchantId,
      status: updated.status as PayInOrderStatus,
    });

    return updated;
  }

  /**
   * Shared transactional kernel for any Pay-In status transition that may cross the "paid"
   * outcome boundary (trader confirmation + admin override).
   *
   * RISK NOTE: this is the single place that mutates `received_fiat_amount`, adjusts cascade
   * `confirmed_payin_amount`, increments requisite usage on CANCELED → paid recovery, credits
   * balances via `creditBalancesOnPaid`, and emits the merchant webhook. Behavioral parity with
   * the original trader/admin flows is preserved (admin webhook now goes through
   * `createPayinWebhookEntry`, which also forwards `trader_processing_method` when set on the
   * order — this is an enrichment, not a removal).
   */
  private async applyPayinPaidTransitionTx(
    tx: Prisma.TransactionClient,
    opts: {
      order: OrderWithRelations;
      targetStatus: PayInOrderStatus;
      /** Local-currency amount used for `received_fiat_amount`, requisite credit, and trader balance crediting. */
      paidCredit: number;
    },
  ): Promise<OrderWithRelations> {
    const { order, targetStatus, paidCredit } = opts;
    const fromStatus = order.status as PayInOrderStatus;
    const wasPaid = PAYIN_PAID_OUTCOME_STATUSES.includes(fromStatus);
    const willPaid = PAYIN_PAID_OUTCOME_STATUSES.includes(targetStatus);
    const prevReceived =
      order.receivedFiatAmount != null ? Number(order.receivedFiatAmount) : 0;

    if (order.requisiteId) {
      if (wasPaid && !willPaid && prevReceived > 0) {
        await this.requisitesService.adjustConfirmedPayinVolumeInTransaction(
          tx,
          order.requisiteId,
          -prevReceived,
        );
      }
      if (!wasPaid && willPaid && paidCredit > 0) {
        await this.requisitesService.adjustConfirmedPayinVolumeInTransaction(
          tx,
          order.requisiteId,
          paidCredit,
        );
      }
    }

    const result = await tx.payinOrder.update({
      where: { id: order.id },
      data: {
        status: targetStatus,
        receivedFiatAmount: willPaid ? paidCredit : null,
        ...payinCompletedAtForHistoryStatus(targetStatus),
      },
      include: ORDER_INCLUDE,
    });

    if (
      fromStatus === PayInOrderStatus.CANCELED &&
      order.requisiteId &&
      willPaid
    ) {
      await this.requisitesService.incrementUsageInTransaction(
        tx,
        order.requisiteId,
        Number(order.amount),
      );
    }

    if (willPaid) {
      if (fromStatus === PayInOrderStatus.APPEAL) {
        const existingIncome = await tx.platformIncome.findUnique({
          where: {
            orderId_orderType: {
              orderId: order.id,
              orderType: PlatformIncomeOrderType.PAYIN,
            },
          },
        });
        if (existingIncome) {
          const prevSettled = Number(existingIncome.orderAmountLocal);
          const delta = paidCredit - prevSettled;
          if (Math.abs(delta) >= 1e-9) {
            await this.adjustBalancesOnPaidAppealDelta(tx, order, delta, paidCredit);
          }
        } else {
          await this.creditBalancesOnPaid(tx, order, paidCredit);
        }
      } else {
        await this.creditBalancesOnPaid(tx, order, paidCredit);
      }
    }

    await this.createPayinWebhookEntry(tx, result);

    return result;
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

    void this.logPayinStatusChange(order.id, order.status, updated.status, {
      actorRole: 'TRADER',
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
      void this.logPayinStatusChange(snapshot.id, snapshot.status, row.status, {
        actorRole: 'SYSTEM',
        note: 'Trader deactivated',
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
        no_requisite_reason: order.noRequisiteReason ?? null,
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
    const traderProfile = await tx.traderProfile.findUniqueOrThrow({
      where: { id: order.traderId },
      select: { payinRate: true, overdraftLimit: true },
    });
    const traderPayinFrac = Number(traderProfile.payinRate);
    const overdraftLimitUsdt = Number(traderProfile.overdraftLimit ?? 0);

    const merchantCredit = creditFiatMerchantPayin(paidAmountLocal, merchantFrac);
    const debitUsdt = debitUsdtPayin(paidAmountLocal, rt);
    const marginUsdt = platformMarginUsdtPayin(paidAmountLocal, rt, ra);
    const marginLocal = platformMarginLocal(marginUsdt, P);

    const existingTraderBal = await tx.traderBalance.findUnique({
      where: {
        traderId_currencyId: { traderId: order.traderId, currencyId: usdtId },
      },
      select: { amount: true },
    });
    const ledgerUsdtBefore = Number(existingTraderBal?.amount ?? 0);
    if (ledgerUsdtBefore - debitUsdt < -overdraftLimitUsdt - 1e-9) {
      throw new BadRequestException(
        `Pay-In settlement would exceed the trader USDT overdraft limit (${overdraftLimitUsdt}): current=${ledgerUsdtBefore}, debit=${debitUsdt.toFixed(4)}`,
      );
    }

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

  /**
   * Applies merchant/trader/platform ledger deltas when an appeal is resolved to a paid outcome
   * and the order was already settled before APPEAL (platform_income row exists).
   *
   * RISK: `deltaLocal` may be negative (underpaid correction); overdraft is checked only when
   * the trader USDT debit increases.
   */
  private async adjustBalancesOnPaidAppealDelta(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
    deltaLocal: number,
    finalPaidLocal: number,
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
    const traderProfile = await tx.traderProfile.findUniqueOrThrow({
      where: { id: order.traderId },
      select: { payinRate: true, overdraftLimit: true },
    });
    const traderPayinFrac = Number(traderProfile.payinRate);
    const overdraftLimitUsdt = Number(traderProfile.overdraftLimit ?? 0);

    const merchantCreditDelta = creditFiatMerchantPayin(deltaLocal, merchantFrac);
    const debitUsdtDelta = debitUsdtPayin(deltaLocal, rt);
    const marginUsdtFinal = platformMarginUsdtPayin(finalPaidLocal, rt, ra);
    const marginLocalFinal = platformMarginLocal(marginUsdtFinal, P);

    if (deltaLocal > 1e-9) {
      const existingTraderBal = await tx.traderBalance.findUnique({
        where: {
          traderId_currencyId: { traderId: order.traderId, currencyId: usdtId },
        },
        select: { amount: true },
      });
      const ledgerUsdtBefore = Number(existingTraderBal?.amount ?? 0);
      if (ledgerUsdtBefore - debitUsdtDelta < -overdraftLimitUsdt - 1e-9) {
        throw new BadRequestException(
          `Pay-In appeal adjustment would exceed the trader USDT overdraft limit (${overdraftLimitUsdt}): current=${ledgerUsdtBefore}, additional_debit=${debitUsdtDelta.toFixed(4)}`,
        );
      }
    }

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
        amount: merchantCreditDelta,
      },
      update: { amount: { increment: merchantCreditDelta } },
    });

    await tx.merchantBalanceTransaction.create({
      data: {
        merchantId: order.merchantId,
        type: MerchantBalanceTransactionType.PAYIN_CREDIT,
        amount: merchantCreditDelta,
        currencyId: order.currencyId,
        referenceId: order.id,
        comment: `Pay-in appeal adjustment order ${order.id} (delta ${deltaLocal} local)`,
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
        amount: -debitUsdtDelta,
      },
      update: { amount: { increment: -debitUsdtDelta } },
    });

    await this.balanceTxService.record({
      traderId: order.traderId,
      type: BalanceTransactionType.PAYIN_DEBIT,
      amount: Math.abs(debitUsdtDelta),
      currency: 'USDT',
      referenceId: order.id,
      comment:
        deltaLocal >= 0
          ? `Pay-in appeal additional USDT debit for order ${order.id}`
          : `Pay-in appeal USDT credit (reversal) for order ${order.id}`,
      tx,
    });

    await tx.platformIncome.update({
      where: {
        orderId_orderType: {
          orderId: order.id,
          orderType: PlatformIncomeOrderType.PAYIN,
        },
      },
      data: {
        orderAmountLocal: finalPaidLocal,
        incomeUsdt: marginUsdtFinal,
        incomeLocal: marginLocalFinal,
        traderRatePct: traderPayinFrac,
        merchantCommissionPct: merchantFrac,
      },
    });

    this.logger.log({
      msg: 'payin.appeal_balance_delta',
      order_id: order.id,
      delta_local: deltaLocal,
      final_paid_local: finalPaidLocal,
      merchant_credit_delta: merchantCreditDelta,
      trader_usdt_delta: -debitUsdtDelta,
    });
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
        await tx.payinPayerPaymentProof.createMany({
          data: fileIds.map((fileId) => ({ payinOrderId: orderId, fileId })),
        });
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

    void this.logPayinStatusChange(order.id, order.status, updated.status, {
      actorRole: 'MERCHANT',
      note:
        fileIds.length > 0
          ? 'Client confirmed order with payment receipt(s)'
          : 'Client confirmed order',
    });

    return payinOrderToOrderDto(updated);
  }

  private prismaCascadeAssignmentLevel(
    level: 'FORK' | 'CARD' | 'PROVIDER',
  ): CascadeAssignmentLevel {
    switch (level) {
      case 'FORK':
        return CascadeAssignmentLevel.FORK;
      case 'CARD':
        return CascadeAssignmentLevel.CARD;
      default:
        return CascadeAssignmentLevel.PROVIDER;
    }
  }

  private async writePayinOrderAssignmentLog(
    tx: Prisma.TransactionClient,
    args: {
      payinOrderId: string;
      amount: number;
      currencyCode: string;
      primary: CascadeAssignmentLevel;
      final: CascadeAssignmentLevel;
    },
  ): Promise<void> {
    await tx.payinOrderAssignmentLog.create({
      data: {
        payinOrderId: args.payinOrderId,
        amount: new Prisma.Decimal(args.amount),
        currencyCode: args.currencyCode,
        primaryBucket: args.primary,
        finalBucket: args.final,
        isFallback: args.primary !== args.final,
        providerTrafficPlanHit:
          args.primary === CascadeAssignmentLevel.PROVIDER &&
          args.final === CascadeAssignmentLevel.PROVIDER,
      },
    });
  }

  private makePayinProviderTierCallback(): (
    db: Prisma.TransactionClient,
    ctx: {
      amount: number;
      currency: string;
      parserRate?: number;
      idempotencyKey: string;
    },
  ) => Promise<
    { kind: 'accepted'; externalRef: string } | { kind: 'declined' } | { kind: 'unavailable' }
  > {
    return async (_db, ctx) => {
      const res = await this.payinProviderService.tryReserve({
        idempotencyKey: ctx.idempotencyKey,
        amount: ctx.amount,
        currencyCode: ctx.currency,
        parserRateFiatPerUsdt: ctx.parserRate,
      });
      if (res.kind === 'accepted') {
        return { kind: 'accepted', externalRef: res.externalRef };
      }
      if (res.kind === 'unavailable') {
        return { kind: 'unavailable' };
      }
      return { kind: 'declined' };
    };
  }

  /**
   * External Pay-In provider callback (TZ §F). Verifies HMAC on the controller; this method applies idempotent status updates.
   * RISK NOTE: `paid` credits merchant fiat only (no trader USDT leg) until a full dual-leg settlement is specified for provider orders.
   */
  async applyExternalProviderWebhook(body: {
    payin_order_id: string;
    status: 'paid' | 'canceled';
  }): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string }> {
    const orderId = String(body.payin_order_id ?? '').trim();
    if (!uuidValidate(orderId)) {
      return { ok: false, error: 'invalid_payin_order_id' };
    }
    const status = String(body.status ?? '').trim().toLowerCase();
    if (status !== 'paid' && status !== 'canceled') {
      return { ok: false, error: 'invalid_status' };
    }

    const order = await this.prisma.payinOrder.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order || !order.providerExternalRef) {
      return { ok: false, error: 'order_not_found' };
    }
    if (order.traderId) {
      return { ok: false, error: 'not_provider_order' };
    }

    const target =
      status === 'paid' ? PayInOrderStatus.PAID : PayInOrderStatus.CANCELED;
    if (!isValidPayInTransition(order.status as PayInOrderStatus, target)) {
      if (order.status === target) {
        return { ok: true, duplicate: true };
      }
      return { ok: false, error: 'invalid_transition' };
    }

    const fromStatus = order.status as PayInOrderStatus;

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.payinOrder.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
      if (!fresh || !fresh.providerExternalRef) {
        return;
      }
      if (!isValidPayInTransition(fresh.status as PayInOrderStatus, target)) {
        return;
      }

      const orderAmount = Number(fresh.amount);
      if (target === PayInOrderStatus.PAID) {
        const existingIncome = await tx.platformIncome.findUnique({
          where: {
            orderId_orderType: {
              orderId: fresh.id,
              orderType: PlatformIncomeOrderType.PAYIN,
            },
          },
        });
        if (!existingIncome) {
          await this.creditMerchantOnlyOnProviderPaid(tx, fresh, orderAmount);
        }
      }

      const result = await tx.payinOrder.update({
        where: { id: orderId },
        data: {
          status: target,
          ...(target === PayInOrderStatus.PAID
            ? {
                receivedFiatAmount: orderAmount,
                ...payinCompletedAtForHistoryStatus(PayInOrderStatus.PAID),
              }
            : payinCompletedAtForHistoryStatus(PayInOrderStatus.CANCELED)),
        },
        include: ORDER_INCLUDE,
      });
      await this.createPayinWebhookEntry(tx, result);
    });

    void this.logPayinStatusChange(orderId, fromStatus, target, {
      actorRole: 'SYSTEM',
      note: 'Provider webhook',
    });

    return { ok: true };
  }

  private async creditMerchantOnlyOnProviderPaid(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
    paidAmountLocal: number,
  ): Promise<void> {
    if (
      order.currency.code !== 'UAH' ||
      order.parserRate == null ||
      order.rateAdminIn == null
    ) {
      throw new BadRequestException(
        'Provider Pay-In settlement requires UAH with parser and admin rate snapshots.',
      );
    }
    const merchantFrac = percentToFraction(Number(order.commissionPercent));
    const merchantCredit = creditFiatMerchantPayin(paidAmountLocal, merchantFrac);
    const P = Number(order.parserRate);
    const ra = Number(order.rateAdminIn);
    const marginUsdt = platformMarginUsdtPayin(paidAmountLocal, ra, ra);
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
        comment: `Pay-in provider credit order ${order.id}`,
      },
    });

    await tx.platformIncome.create({
      data: {
        orderId: order.id,
        orderType: PlatformIncomeOrderType.PAYIN,
        merchantId: order.merchantId,
        traderId: null,
        orderAmountLocal: paidAmountLocal,
        parserRate: P,
        rateTrader: ra,
        rateAdmin: ra,
        traderRatePct: 0,
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeLocal: marginLocal,
      },
    });

    this.logger.log({
      msg: 'payin.provider_settlement.merchant_only',
      order_id: order.id,
      merchant_credit: merchantCredit,
      currency: order.currency.code,
    });
  }

  async getPayinOrderStatusHistoryForTrader(
    traderId: string,
    orderId: string,
  ): Promise<OrderStatusHistoryEntry[]> {
    const order = await this.prisma.payinOrder.findFirst({
      where: { id: orderId, traderId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const history = await fetchOrderStatusHistory(this.prisma, orderId, {
      orderCreatedAt: order.createdAt,
    });
    return withOrderStatusHistoryFallback(history, {
      status: order.status,
      createdAt: order.createdAt,
    });
  }

  async getPayinOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    const order = await this.prisma.payinOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const history = await fetchOrderStatusHistory(this.prisma, orderId, {
      orderCreatedAt: order.createdAt,
    });
    return withOrderStatusHistoryFallback(history, {
      status: order.status,
      createdAt: order.createdAt,
    });
  }

  private logPayinOrderCreated(orderId: string, status: PayInOrderStatus): void {
    const { fromStatus, note } = initialOrderStatusAuditFrom(status);
    void this.logPayinStatusChange(orderId, fromStatus, status, {
      actorRole: 'MERCHANT',
      note,
    });
  }

  private logPayinStatusChange(
    orderId: string,
    fromStatus: string,
    toStatus: string,
    ctx: { actorId?: string; actorRole?: string; note?: string } = {},
  ): void {
    void recordOrderStatusChange(this.audit, {
      entityType: OrderStatusHistoryEntity.payin,
      orderId,
      fromStatus,
      toStatus,
      actorId: ctx.actorId ?? null,
      actorRole: ctx.actorRole ?? null,
      note: ctx.note ?? null,
    }).catch(() => undefined);
  }

  /** Observability when provider traffic share is non-zero but integration is absent. */
  private async logProviderTierStub(
    tx: Prisma.TransactionClient,
    currency: string,
    amount: number,
  ): Promise<void> {
    const cascadeCfg = await tx.cascadeSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
    const providerPct = cascadeCfg ? Number(cascadeCfg.providerTrafficPercent) : 0;
    if (providerPct > 1e-9) {
      this.logger.log({
        msg: 'payin.provider_tier_stub',
        currency: currency.trim().toUpperCase(),
        amount,
        provider_traffic_percent: providerPct,
      });
    }
  }
}

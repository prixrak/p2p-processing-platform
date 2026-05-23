import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  PayoutOrder,
  PayoutStatus,
  PayoutPoolType,
  PayoutTraderRejectReason,
} from '@prisma/client';
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
  PayoutTraderRejectReason as PayoutTraderRejectReasonApi,
  MAX_PAYOUT_COMPLETION_PROOF_FILES,
  UserRole,
} from '@p2p/shared';
import type {
  PayOutOrderApiDto,
  PayOutOrderCabinetDto,
  ProfileDto,
  DetailsDto,
} from '@p2p/shared';
import {
  creditUsdtPayout,
  debitFiatMerchantPayout,
  percentToFraction,
  platformMarginLocal,
  platformMarginUsdtPayout,
  rateAdminOut,
  rateTraderOut,
} from '@p2p/shared';
import {
  BalanceTransactionType,
  DirectionType as PrismaDirectionType,
  MerchantBalanceTransactionType,
  PlatformIncomeOrderType,
  PayoutTraderBalanceTxType,
} from '@prisma/client';
import { buildPayoutOrderSearchOr } from '../../common/order-search-where';
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { assertAmountWithinDirectionMinMax } from '../../common/utils/direction-amount-limits.util';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { TelegramService } from '../telegram/telegram.service';
import { CurrenciesService } from '../currencies/currencies.service';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import { resolveStatisticsWindow } from '../../common/utils/statistics-window';
import { csvEscape, enumerateDaysUTC, statusRecordToLowercase } from '../../common/utils/stats.util';
import { buildMerchantProfileDto } from '../../common/utils/merchant-profile.helper';
import {
  OrderUploadDto,
  PayoutOrderInfoDto,
  PayoutListFiltersDto,
  SpecialistCompleteDto,
  AttachCompletionProofDto,
  TraderFailDto,
} from './dto';
import { PayoutRealtimeService } from './payout-realtime.service';
import {
  parsePayoutTraderRejectBody,
  PayoutTraderRejectPayloadError,
} from './payout-trader-reject.util';
import { computePayoutPoolCloseDeadline } from './payout-pool-close-deadline.util';
import type { ExternalOrderCreationMeta } from '../../common/utils/partner-request-meta';
import { FilesService } from '../files/files.service';
import { AuditService } from '../audit/audit.service';
import {
  fetchOrderStatusHistory,
  initialOrderStatusAuditFrom,
  OrderStatusHistoryEntity,
  recordOrderStatusChange,
  withOrderStatusHistoryFallback,
  type OrderStatusHistoryEntry,
} from '../../common/order-status-history/order-status-history';

const COMPLETION_PROOF_ATTACHMENTS_INCLUDE = {
  select: { fileId: true, createdAt: true },
  orderBy: { createdAt: 'asc' as const },
} as const;

const CABINET_ORDER_INCLUDE = {
  paymentMethod: { select: { displayName: true } },
  currency: { select: { code: true } },
  completionProofAttachments: COMPLETION_PROOF_ATTACHMENTS_INCLUDE,
} as const;

const ORDER_INCLUDE = {
  currency: { select: { code: true } },
  completionProofAttachments: COMPLETION_PROOF_ATTACHMENTS_INCLUDE,
} as const;

/** Singleton row for global pool B share (see migration seed). */
const PAYOUT_POOL_SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';

/** Audit actor used when stripping Pay-Out proofs inside platform-driven transitions after the DB unlink commits. */
const PAYOUT_INTERNAL_PROOF_PURGE_ACTOR = {
  id: '00000000-0000-0000-0000-000000000000',
  role: UserRole.ADMIN,
} satisfies { id: string; role: string };

/**
 * Discriminated identity of a Pay-Out order assignee — standard trader (pool A) vs
 * pay-out specialist (pool B). Used to share list/refund/proof logic between the two
 * cabinets without changing the public URLs each side calls.
 */
export type PayoutAssigneeScope =
  | { kind: 'TRADER'; traderId: string }
  | { kind: 'PAYOUT_TRADER'; payoutTraderId: string };

function payoutAssigneeWhereKey(
  scope: PayoutAssigneeScope,
): Pick<Prisma.PayoutOrderWhereInput, 'traderId' | 'payoutTraderId'> {
  return scope.kind === 'TRADER'
    ? { traderId: scope.traderId }
    : { payoutTraderId: scope.payoutTraderId };
}

/**
 * Common queue/status filter logic used by trader list, specialist list, and CSV export.
 * Returns the assembled `where` (assignee + status) so callers can add custom amount/date filters.
 */
function buildAssignedListWhere(
  scope: PayoutAssigneeScope,
  filters: PayoutListFiltersDto,
): Prisma.PayoutOrderWhereInput {
  const parsedStatus =
    filters.status &&
    (Object.values(PayoutStatus) as string[]).includes(filters.status)
      ? (filters.status as PayoutStatus)
      : undefined;

  let statusFilter: Prisma.PayoutOrderWhereInput['status'];
  if (filters.queue === 'in_progress') {
    const allowed = PAYOUT_TRADER_IN_PROGRESS_STATUSES as unknown as PayoutStatus[];
    statusFilter = parsedStatus
      ? allowed.includes(parsedStatus)
        ? parsedStatus
        : { in: [] }
      : { in: allowed };
  } else if (filters.queue === 'history') {
    const allowed = PAYOUT_TRADER_HISTORY_STATUSES as unknown as PayoutStatus[];
    statusFilter = parsedStatus
      ? allowed.includes(parsedStatus)
        ? parsedStatus
        : { in: [] }
      : { in: allowed };
  } else if (parsedStatus) {
    statusFilter = parsedStatus;
  }

  return {
    ...payoutAssigneeWhereKey(scope),
    ...(statusFilter !== undefined ? { status: statusFilter } : {}),
  };
}

type _CabinetPayload = Prisma.PayoutOrderGetPayload<{ include: typeof CABINET_ORDER_INCLUDE }>;
type PayoutOrderRow = Prisma.PayoutOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type PayoutOrderApiSource = PayoutOrderRow | _CabinetPayload;
/** Full payout order row for v2 settlement (no required relation beyond scalars). */
type PayoutOrderScalars = PayoutOrder;


@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceTxService: BalanceTransactionsService,
    private readonly payoutRealtime: PayoutRealtimeService,
    private readonly merchantDirections: MerchantDirectionsService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly telegram: TelegramService,
    private readonly currencies: CurrenciesService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private emitPayoutOrderRealtime(
    order: Pick<
      PayoutOrder,
      'id' | 'status' | 'traderId' | 'payoutTraderId' | 'merchantId'
    >,
    poolChanged: boolean,
  ): void {
    void this.payoutRealtime.publish({
      type: PAYOUT_ORDER_REALTIME_EVENT_TYPE,
      orderId: order.id,
      status: order.status as PayOutOrderStatus,
      traderId: order.traderId,
      payoutTraderId: order.payoutTraderId,
      merchantId: order.merchantId,
      poolChanged,
    });
  }

  private async loadCabinetOrder(id: string): Promise<_CabinetPayload> {
    return this.prisma.payoutOrder.findUniqueOrThrow({
      where: { id },
      include: CABINET_ORDER_INCLUDE,
    });
  }

  private normalizeCompletionProofIds(dto?: {
    completion_proof_file_id?: string;
    completion_proof_file_ids?: string[];
  } | null): string[] {
    if (!dto) return [];
    const fromArr = dto.completion_proof_file_ids?.filter(Boolean) ?? [];
    const fromOne = dto.completion_proof_file_id ? [dto.completion_proof_file_id] : [];
    return [...new Set([...fromOne, ...fromArr])];
  }

  private completionProofIdsFromOrder(order: {
    completionProofFileId: string | null;
    completionProofAttachments?: { fileId: string }[];
  }): string[] {
    if (order.completionProofAttachments && order.completionProofAttachments.length > 0) {
      return order.completionProofAttachments.map((a) => a.fileId);
    }
    if (order.completionProofFileId) return [order.completionProofFileId];
    return [];
  }

  private async syncPayoutCompletionProofHeadColumn(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const first = await tx.payoutCompletionProofAttachment.findFirst({
      where: { payoutOrderId: orderId },
      orderBy: { createdAt: 'asc' },
      select: { fileId: true },
    });
    await tx.payoutOrder.update({
      where: { id: orderId },
      data: { completionProofFileId: first?.fileId ?? null },
    });
  }

  /**
   * Delete attachment rows + reset the mirrored head column during a payout status transition tx.
   * Returns distinct linked file ids for best-effort orphan purge after the transaction commits.
   */
  private async unlinkAllCompletionProofsInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<string[]> {
    const attachments = await tx.payoutCompletionProofAttachment.findMany({
      where: { payoutOrderId: orderId },
      select: { fileId: true },
    });
    const head = await tx.payoutOrder.findUnique({
      where: { id: orderId },
      select: { completionProofFileId: true },
    });
    const ids = new Set<string>();
    for (const a of attachments) ids.add(a.fileId);
    if (head?.completionProofFileId) ids.add(head.completionProofFileId);
    await tx.payoutCompletionProofAttachment.deleteMany({
      where: { payoutOrderId: orderId },
    });
    await this.syncPayoutCompletionProofHeadColumn(tx, orderId);
    return [...ids];
  }

  private async purgeUnlinkedPayoutProofFiles(fileIds: readonly string[]): Promise<void> {
    for (const fileId of fileIds) {
      try {
        await this.files.deleteOrphanFile(PAYOUT_INTERNAL_PROOF_PURGE_ACTOR, fileId, {
          skipOwnershipCheck: true,
        });
      } catch (err) {
        this.logger.warn(
          `Pay-Out proof orphan purge skipped for ${fileId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async assertCompletionProofFilesOwned(ids: string[], userId: string): Promise<void> {
    await Promise.all(ids.map((id) => this.assertCompletionProofFileOwned(id, userId)));
  }

  private applyPayoutListFilters(
    where: Prisma.PayoutOrderWhereInput,
    filters: PayoutListFiltersDto,
  ): void {
    if (filters.date_from || filters.date_to) {
      const range: Prisma.DateTimeFilter = {};
      if (filters.date_from) range.gte = new Date(filters.date_from);
      if (filters.date_to) {
        const t = new Date(filters.date_to);
        t.setUTCHours(23, 59, 59, 999);
        range.lte = t;
      }
      if (filters.queue === 'history') {
        where.endAt = range;
      } else {
        where.createdAt = range;
      }
    }

    if (filters.min_amount != null || filters.max_amount != null) {
      const extraAmt: Prisma.DecimalFilter = {};
      if (filters.min_amount != null) extraAmt.gte = filters.min_amount;
      if (filters.max_amount != null) extraAmt.lte = filters.max_amount;

      const existing = where.amount;
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        const merged: Prisma.DecimalFilter = { ...(existing as Prisma.DecimalFilter) };
        if (extraAmt.gte != null) {
          const prev = merged.gte != null ? Number(merged.gte) : undefined;
          merged.gte =
            prev != null ? Math.max(prev, Number(extraAmt.gte)) : extraAmt.gte;
        }
        if (extraAmt.lte != null) {
          const prev = merged.lte != null ? Number(merged.lte) : undefined;
          merged.lte =
            prev != null ? Math.min(prev, Number(extraAmt.lte)) : extraAmt.lte;
        }
        where.amount = merged;
      } else {
        where.amount = extraAmt;
      }
    }

    if (filters.search) {
      const searchOr = buildPayoutOrderSearchOr(filters.search) as Prisma.PayoutOrderWhereInput[];
      if (searchOr.length > 0) {
        const prevAnd = where.AND;
        const andArr = Array.isArray(prevAnd) ? [...prevAnd] : prevAnd ? [prevAnd] : [];
        andArr.push({ OR: searchOr });
        where.AND = andArr;
      }
    }
  }

  private async pickPoolTypeForNewOrder(merchantId: string): Promise<PayoutPoolType> {
    const assign = await this.prisma.merchantPayoutPoolAssignment.findUnique({
      where: { merchantId },
    });
    if (assign?.isActive && Number(assign.poolBPercent) > 0) {
      if (Math.random() * 100 < Number(assign.poolBPercent)) {
        return PayoutPoolType.PAYOUT_SPECIALIST;
      }
      return PayoutPoolType.STANDARD;
    }

    const settings = await this.prisma.payoutPoolSetting.findUnique({
      where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
    });
    const pct = settings ? Number(settings.poolBGlobalPercent) : 0;
    if (pct > 0 && Math.random() * 100 < pct) {
      return PayoutPoolType.PAYOUT_SPECIALIST;
    }
    return PayoutPoolType.STANDARD;
  }

  // ─── External: order_upload ───

  async orderUpload(
    merchantId: string,
    dto: OrderUploadDto,
    meta?: ExternalOrderCreationMeta,
  ): Promise<PayOutOrderApiDto> {
    if (!dto.request_id || !dto.currency || !dto.amount || !dto.details) {
      throw new BadRequestException('request_id, currency, amount, and details are required');
    }

    if (dto.callback_url) {
      await validateCallbackUrl(dto.callback_url);
    }

    const fiatCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    const direction = await this.prisma.direction.findFirst({
      where: { type: DirectionType.PAYOUT, toCurrencyId: fiatCurrencyId, isOnline: true },
    });
    if (!direction) {
      throw new BadRequestException(`No active PAYOUT direction for ${dto.currency}`);
    }

    assertAmountWithinDirectionMinMax(
      dto.amount,
      dto.currency,
      direction.minAmount,
      direction.maxAmount,
      'platform Pay-Out direction',
    );

    await this.merchantDirections.assertOrderAmountWithinActiveMerchantDirection(
      merchantId,
      PrismaDirectionType.PAYOUT,
      dto.currency,
      dto.amount,
    );
    await this.merchantDirections.assertOrderAmountNotBlocked(
      merchantId,
      PrismaDirectionType.PAYOUT,
      dto.currency,
      dto.amount,
    );

    const merchantPct =
      (await this.merchantDirections.getEffectiveCommissionPercent(
        merchantId,
        PrismaDirectionType.PAYOUT,
        dto.currency,
        dto.amount,
      )) ?? Number(direction.percentFee);
    
    const isFiatV2 = dto.currency === 'UAH' || dto.currency === 'KZT';
    let parserRate: number | undefined;
    let rateAdminOutVal: number | undefined;
    if (isFiatV2) {
      try {
        parserRate = await this.exchangeRate.requireParserRateFiatPerUsdt(dto.currency);
      } catch (e) {
        if (e instanceof Error && e.message === 'PARSER_RATE_UNSUPPORTED_FIAT') {
          throw new BadRequestException(`Pay-Out v2 is not enabled for currency ${dto.currency}`);
        }
        throw new BadRequestException(
          'Exchange rate temporarily unavailable. Please try again shortly.',
        );
      }
      rateAdminOutVal = rateAdminOut(parserRate, percentToFraction(merchantPct));
    }

    const merchantFrac = percentToFraction(merchantPct);
    const merchantDebitLocal =
      isFiatV2 && parserRate !== undefined
        ? debitFiatMerchantPayout(dto.amount, merchantFrac)
        : null;
    const feeLocal = merchantDebitLocal !== null ? merchantDebitLocal - dto.amount : null;
    const partnerAmount = isFiatV2 ? dto.amount : dto.amount - (dto.amount * merchantPct) / 100;

    const poolType = await this.pickPoolTypeForNewOrder(merchantId);
    const poolAssignedAt = new Date();

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        if (isFiatV2 && merchantDebitLocal !== null) {
          let bal = await tx.merchantBalance.findUnique({
            where: {
              merchantId_currencyId: { merchantId, currencyId: fiatCurrencyId },
            },
          });
          if (!bal) {
            bal = await tx.merchantBalance.create({
              data: { merchantId, currencyId: fiatCurrencyId, amount: 0 },
            });
          }
          if (Number(bal.amount) < merchantDebitLocal) {
            throw new BadRequestException('Insufficient balance on merchant account');
          }

          await tx.merchantBalance.update({
            where: {
              merchantId_currencyId: { merchantId, currencyId: fiatCurrencyId },
            },
            data: { amount: { increment: -merchantDebitLocal } },
          });
        }

        const created = await tx.payoutOrder.create({
          data: {
            requestId: dto.request_id,
            merchantId,
            amount: dto.amount,
            currencyId: fiatCurrencyId,
            status: 'PENDING',
            poolType,
            poolAssignedAt,
            detailsType: dto.details.type as any,
            detailsNumber: dto.details.number,
            detailsOwner: dto.details.owner,
            detailsCode: dto.details.code,
            rate: 1,
            partnerAmount,
            commissionAmount: feeLocal ?? (dto.amount * merchantPct) / 100,
            percentFee: merchantPct,
            parserRate: parserRate ?? undefined,
            rateAdminOut: rateAdminOutVal ?? undefined,
            merchantDebitLocal: merchantDebitLocal ?? undefined,
            callbackUrl: dto.callback_url,
            partnerIp: meta?.partnerIp ?? undefined,
            externalApiPath: meta?.externalApiPath ?? undefined,
          },
          include: ORDER_INCLUDE,
        });

        if (isFiatV2 && merchantDebitLocal !== null) {
          await tx.merchantBalanceTransaction.create({
            data: {
              merchantId,
              type: MerchantBalanceTransactionType.PAYOUT_DEBIT,
              amount: merchantDebitLocal,
              currencyId: fiatCurrencyId,
              referenceId: created.id,
              comment: `Pay-out reserve for order ${created.id}`,
            },
          });
        }

        await this.createPayoutWebhookEntry(tx, created);

        return created;
      });

      this.emitPayoutOrderRealtime(order, true);

      this.logPayoutOrderCreated(order.id, order.status);

      if (poolType === PayoutPoolType.PAYOUT_SPECIALIST) {
        void this.telegram
          .notifyPayoutSpecialistsNewPoolOrder(dto.currency, {
            id: order.id,
            amount: Number(order.amount),
            currency: dto.currency,
          })
          .catch(() => undefined);
      }

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
    return buildMerchantProfileDto(this.prisma, merchantId, DirectionType.PAYOUT);
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
      include: { user: { select: { isActive: true } } },
    });
    if (!trader?.user) throw new NotFoundException('Trader profile not found');

    if (!trader.user.isActive || !trader.isActive || !trader.acceptingOrders) {
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
      poolType: PayoutPoolType.STANDARD,
      ...(Object.keys(amountFilter).length > 0 ? { amount: amountFilter } : {}),
    };

    this.applyPayoutListFilters(where, filters);

    const [items, total, poolSettings] = await Promise.all([
      this.prisma.payoutOrder.findMany({
        where,
        include: CABINET_ORDER_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutOrder.count({ where }),
      this.prisma.payoutPoolSetting.findUnique({
        where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
      }),
    ]);

    return {
      orders: items.map((o) =>
        this.toPayOutOrderCabinetDto(o, {
          poolListing: true,
          poolCloseDeadline: computePayoutPoolCloseDeadline({
            poolType: o.poolType,
            createdAt: o.createdAt,
            poolAssignedAt: o.poolAssignedAt,
            poolTimeoutEnabled: poolSettings?.poolTimeoutEnabled ?? false,
            poolTimeoutHours: poolSettings?.poolTimeoutHours,
          }),
        }),
      ),
      total,
      page,
      limit,
    };
  }

  /**
   * Pool B — pending orders for the specialist's geo (country currency).
   */
  async getSpecialistPool(payoutTraderId: string, filters: PayoutListFiltersDto = {}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const profile = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: {
        country: { include: { currency: true } },
        user: { select: { isActive: true } },
      },
    });
    if (!profile) throw new NotFoundException('Pay-Out specialist profile not found');
    if (!profile.user) throw new NotFoundException('Pay-Out specialist profile not found');
    if (!profile.isActive || !profile.user.isActive) {
      return { orders: [], total: 0, page, limit };
    }

    const currencyFilter = { code: profile.country.currency.code };

    const where: Prisma.PayoutOrderWhereInput = {
      status: 'PENDING',
      poolType: PayoutPoolType.PAYOUT_SPECIALIST,
      traderId: null,
      payoutTraderId: null,
      currency: currencyFilter,
    };

    this.applyPayoutListFilters(where, filters);

    const [items, total, poolSettings] = await Promise.all([
      this.prisma.payoutOrder.findMany({
        where,
        include: CABINET_ORDER_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutOrder.count({ where }),
      this.prisma.payoutPoolSetting.findUnique({
        where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
      }),
    ]);

    return {
      orders: items.map((o) =>
        this.toPayOutOrderCabinetDto(o, {
          poolListing: true,
          poolCloseDeadline: computePayoutPoolCloseDeadline({
            poolType: o.poolType,
            createdAt: o.createdAt,
            poolAssignedAt: o.poolAssignedAt,
            poolTimeoutEnabled: poolSettings?.poolTimeoutEnabled ?? false,
            poolTimeoutHours: poolSettings?.poolTimeoutHours,
          }),
        }),
      ),
      total,
      page,
      limit,
    };
  }

  // ─── Internal: traderTakeFromPool ─── (trader self-assigns from pool; PENDING → PROCESSING)

  async traderTakeFromPool(traderId: string, orderId: string): Promise<PayOutOrderCabinetDto> {
    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      include: { user: { select: { isActive: true } } },
    });
    if (!trader?.user) throw new NotFoundException('Trader profile not found');

    if (!trader.user.isActive) {
      throw new ForbiddenException(
        'This account has been deactivated. Please contact support.',
      );
    }

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
          AND pool_type = 'STANDARD'
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

      if (
        !isValidPayOutTransition(
          order.status as PayOutOrderStatus,
          PayOutOrderStatus.PROCESSING,
        )
      ) {
        throw new BadRequestException(
          `Invalid status transition: ${order.status} -> PROCESSING`,
        );
      }

      const startAt = new Date();
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { traderId, status: 'PROCESSING', startAt },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Trader ${traderId} self-assigned payout order ${orderId} from pool`);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, true);

    void this.logPayoutStatusChange(orderId, 'PENDING', 'PROCESSING', { actorRole: 'TRADER' });

    const full = await this.loadCabinetOrder(orderId);
    void this.telegram
      .notifyNewPayout(traderId, {
        id: full.id,
        amount: Number(full.amount),
        currency: full.currency.code,
      })
      .catch(() => undefined);

    return this.toPayOutOrderCabinetDto(full);
  }

  async specialistTakeFromPool(
    payoutTraderId: string,
    orderId: string,
  ): Promise<PayOutOrderCabinetDto> {
    const profile = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: {
        country: { include: { currency: true } },
        user: { select: { isActive: true } },
      },
    });
    if (!profile?.user) {
      throw new NotFoundException('Pay-Out specialist profile not found');
    }

    if (!profile.user.isActive) {
      throw new ForbiddenException(
        'This account has been deactivated. Please contact support.',
      );
    }

    if (!profile.isActive) {
      throw new ForbiddenException('Your specialist account is inactive.');
    }

    const currencyId = profile.country.currencyId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM payout_orders
        WHERE id = ${orderId}::uuid
          AND status = 'PENDING'
          AND trader_id IS NULL
          AND payout_trader_id IS NULL
          AND pool_type = 'PAYOUT_SPECIALIST'
          AND currency_id = ${currencyId}::uuid
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        throw new ConflictException(
          'Order not in your pool, wrong geo or currency, or already assigned',
        );
      }

      const order = rows[0];
      if (
        !isValidPayOutTransition(
          order.status as PayOutOrderStatus,
          PayOutOrderStatus.PROCESSING,
        )
      ) {
        throw new BadRequestException(`Invalid status transition: ${order.status} -> PROCESSING`);
      }

      const startAt = new Date();
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: { payoutTraderId, status: 'PROCESSING', startAt },
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Pay-Out specialist ${payoutTraderId} claimed order ${orderId} (PROCESSING)`);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, true);

    void this.logPayoutStatusChange(orderId, 'PENDING', 'PROCESSING', {
      actorRole: 'PAYOUT_TRADER',
    });

    const full = await this.loadCabinetOrder(orderId);
    return this.toPayOutOrderCabinetDto(full);
  }

  // ─── Internal: assignToTrader ─── (admin/support assigns from pool to a trader or specialist)

  async assignToTrader(dto: {
    orderId: string;
    traderId?: string;
    payoutTraderId?: string;
  }): Promise<PayOutOrderApiDto> {
    const { orderId } = dto;
    const hasTrader = Boolean(dto.traderId);
    const hasSpecialist = Boolean(dto.payoutTraderId);
    if (hasTrader === hasSpecialist) {
      throw new BadRequestException('Provide exactly one of traderId or payoutTraderId');
    }

    let poolType: PayoutPoolType | null = null;
    if (dto.traderId) {
      const targetTrader = await this.prisma.traderProfile.findUnique({
        where: { id: dto.traderId },
        include: { user: { select: { isActive: true } } },
      });
      if (!targetTrader?.user) {
        throw new NotFoundException('Trader profile not found');
      }
      if (!targetTrader.user.isActive) {
        throw new BadRequestException(
          'This trader cannot receive assignments (user account deactivated)',
        );
      }
      if (!targetTrader.isActive || !targetTrader.acceptingOrders) {
        throw new BadRequestException(
          'This trader is not accepting new assignments (inactive or paused)',
        );
      }
      poolType = PayoutPoolType.STANDARD;
    } else if (dto.payoutTraderId) {
      const spec = await this.prisma.payoutTraderProfile.findUnique({
        where: { id: dto.payoutTraderId },
        include: { user: { select: { isActive: true } } },
      });
      if (!spec?.user) {
        throw new NotFoundException('Pay-Out specialist profile not found');
      }
      if (!spec.user.isActive) {
        throw new BadRequestException(
          'This Pay-Out specialist cannot receive assignments (user account deactivated)',
        );
      }
      if (!spec.isActive) {
        throw new BadRequestException('This Pay-Out specialist account is inactive');
      }
      poolType = PayoutPoolType.PAYOUT_SPECIALIST;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; pool_type: string }>>`
        SELECT id, status, pool_type::text AS pool_type
        FROM payout_orders
        WHERE id = ${orderId}::uuid
          AND status = 'PENDING'
          AND trader_id IS NULL
          AND payout_trader_id IS NULL
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        throw new NotFoundException('Order not found in pool (must be PENDING with no assignee)');
      }

      const row = rows[0];
      if (row.pool_type !== poolType) {
        throw new BadRequestException(
          `Order pool type ${row.pool_type} does not match assignee type`,
        );
      }

      const targetStatus = PayOutOrderStatus.PROCESSING;
      if (!isValidPayOutTransition(row.status as PayOutOrderStatus, targetStatus)) {
        throw new BadRequestException(`Invalid status transition: ${row.status} -> ${targetStatus}`);
      }

      const data =
        dto.traderId != null
          ? { traderId: dto.traderId, status: 'PROCESSING' as const, startAt: new Date() }
          : {
              payoutTraderId: dto.payoutTraderId!,
              status: 'PROCESSING' as const,
              startAt: new Date(),
            };

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data,
      });

      await this.createPayoutWebhookEntry(tx, result);
      this.logger.log(`Admin assigned payout order ${orderId} (${JSON.stringify(data)})`);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, true);

    void this.logPayoutStatusChange(orderId, 'PENDING', 'PROCESSING', { actorRole: 'SUPPORT' });

    const full = await this.loadCabinetOrder(orderId);
    if (dto.traderId) {
      void this.telegram
        .notifyNewPayout(dto.traderId, {
          id: full.id,
          amount: Number(full.amount),
          currency: full.currency.code,
        })
        .catch(() => undefined);
    }

    return this.toPayOutOrderApiDto(full);
  }

  // ─── Internal: getTraderOrders ───

  async getTraderOrders(traderId: string, filters: PayoutListFiltersDto) {
    return this.listAssignedOrders({ kind: 'TRADER', traderId }, filters);
  }

  async getSpecialistOrders(payoutTraderId: string, filters: PayoutListFiltersDto) {
    return this.listAssignedOrders(
      { kind: 'PAYOUT_TRADER', payoutTraderId },
      filters,
    );
  }

  private async listAssignedOrders(
    scope: PayoutAssigneeScope,
    filters: PayoutListFiltersDto,
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, MAX_PAGE_SIZE);

    const where = buildAssignedListWhere(scope, filters);
    this.applyPayoutListFilters(where, filters);

    const [items, total] = await Promise.all([
      this.prisma.payoutOrder.findMany({
        where,
        include: CABINET_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutOrder.count({ where }),
    ]);

    return {
      orders: items.map((o) => this.toPayOutOrderCabinetDto(o)),
      total,
      page,
      limit,
    };
  }

  async getSpecialistSummary(payoutTraderId: string) {
    const p = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: {
        country: { include: { currency: true } },
        user: { select: { email: true } },
      },
    });
    if (!p) {
      throw new NotFoundException('Pay-Out specialist profile not found');
    }

    const currencyId = p.country.currencyId;
    const now = new Date();
    const startOfUtcDay = new Date(now);
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    const baseToday = {
      payoutTraderId,
      currencyId,
      endAt: { gte: startOfUtcDay, lte: now },
    };

    const [
      completedTodayAgg,
      completedTodayCount,
      failedTodayCount,
      inProgressCount,
    ] = await Promise.all([
      this.prisma.payoutOrder.aggregate({
        where: { ...baseToday, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.payoutOrder.count({
        where: { ...baseToday, status: 'COMPLETED' },
      }),
      this.prisma.payoutOrder.count({
        where: { ...baseToday, status: 'FAILED' },
      }),
      this.prisma.payoutOrder.count({
        where: {
          payoutTraderId,
          currencyId,
          status: { in: ['NEW', 'PROCESSING'] },
        },
      }),
    ]);

    return {
      email: p.user.email,
      balance_usdt: Number(p.balanceUsdt),
      payout_rate: Number(p.payoutRate),
      country: {
        name: p.country.name,
        code: p.country.code,
        currency: p.country.currency.code,
      },
      is_active: p.isActive,
      exchange_parser: p.exchangeParser,
      today_utc: {
        completed_count: completedTodayCount,
        completed_volume_fiat: Number(completedTodayAgg._sum.amount ?? 0),
        failed_count: failedTodayCount,
        in_progress_count: inProgressCount,
      },
    };
  }

  /**
   * Move STANDARD pool orders that stayed PENDING (unassigned) past the configured timeout into pool B.
   */
  async promoteStaleStandardPoolOrders(): Promise<number> {
    const settings = await this.prisma.payoutPoolSetting.findUnique({
      where: { id: PAYOUT_POOL_SETTINGS_ROW_ID },
    });
    if (!settings?.poolTimeoutEnabled || settings.poolTimeoutHours == null || settings.poolTimeoutHours < 1) {
      return 0;
    }

    const hours = settings.poolTimeoutHours;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stale = await this.prisma.payoutOrder.findMany({
      where: {
        status: 'PENDING',
        poolType: PayoutPoolType.STANDARD,
        traderId: null,
        payoutTraderId: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    if (stale.length === 0) return 0;

    await this.prisma.payoutOrder.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: {
        poolType: PayoutPoolType.PAYOUT_SPECIALIST,
        poolAssignedAt: new Date(),
      },
    });

    const refreshed = await this.prisma.payoutOrder.findMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });

    for (const o of refreshed) {
      this.emitPayoutOrderRealtime(o, true);
    }

    this.logger.log(
      `Pool timeout: promoted ${refreshed.length} Pay-Out order(s) from STANDARD to PAYOUT_SPECIALIST (>${hours}h in pool)`,
    );

    return refreshed.length;
  }

  async getSpecialistStatistics(payoutTraderId: string, query: StatisticsQueryDto) {
    const profile = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: { country: { include: { currency: true } } },
    });
    if (!profile) {
      throw new NotFoundException(`Pay-Out specialist ${payoutTraderId} not found`);
    }

    const window = resolveStatisticsWindow(query);
    const currencyId = profile.country.currencyId;
    const currency = profile.country.currency.code;
    const dateWhere = { gte: window.from, lte: window.to };
    const base = { payoutTraderId, currencyId, createdAt: dateWhere };

    const [
      payoutTotal,
      payoutCompletedSum,
      payoutCompletedCount,
      payoutFailedCount,
      payoutGroup,
      payoutByDay,
    ] = await Promise.all([
      this.prisma.payoutOrder.count({ where: base }),
      this.prisma.payoutOrder.aggregate({
        where: { ...base, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.payoutOrder.count({
        where: { ...base, status: 'COMPLETED' },
      }),
      this.prisma.payoutOrder.count({
        where: {
          ...base,
          status: { in: ['FAILED', 'UPLOAD_FAILED'] },
        },
      }),
      this.prisma.payoutOrder.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; volume: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
                 COALESCE(SUM(amount), 0) AS volume
          FROM payout_orders
          WHERE payout_trader_id = ${payoutTraderId}::uuid
            AND currency_id = ${currencyId}::uuid
            AND status = 'COMPLETED'
            AND created_at >= ${window.from}
            AND created_at <= ${window.to}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
    ]);

    const totalOrders = payoutTotal;
    const successfulOrders = payoutCompletedCount;
    const canceledOrders = payoutFailedCount;
    const totalVolume = Number(payoutCompletedSum._sum.amount ?? 0);
    const conversionRate = totalOrders > 0 ? (successfulOrders / totalOrders) * 100 : 0;

    const payoutVolMap = new Map<string, number>();
    for (const row of payoutByDay) {
      const key = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);
      payoutVolMap.set(key, Number(row.volume));
    }

    const dayKeys = enumerateDaysUTC(window.from, window.to);
    const volumeByDay = dayKeys.map((date) => {
      const payoutVolume = payoutVolMap.get(date) ?? 0;
      return {
        date,
        payinVolume: 0,
        payoutVolume,
        totalVolume: payoutVolume,
      };
    });

    return {
      payout_trader_id: payoutTraderId,
      currency,
      period: window.period,
      date_from: window.dateFrom,
      date_to: window.dateTo,
      total_volume: totalVolume,
      total_orders: totalOrders,
      successful_orders: successfulOrders,
      canceled_orders: canceledOrders,
      conversion_rate: conversionRate,
      volume_by_day: volumeByDay,
      orders_by_status: {
        pay_in: {},
        payout: statusRecordToLowercase(payoutGroup),
      },
    };
  }

  async getSpecialistLedger(
    payoutTraderId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Array<{
      id: string;
      type: string;
      amount: number;
      currency: string;
      comment: string | null;
      reference_id: string | null;
      created_at: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where = { payoutTraderId };

    const [rows, total] = await Promise.all([
      this.prisma.payoutTraderBalanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { currency: { select: { code: true } } },
      }),
      this.prisma.payoutTraderBalanceTransaction.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount),
        currency: r.currency.code,
        comment: r.comment,
        reference_id: r.referenceId,
        created_at: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit: take,
    };
  }

  async getSpecialistSettlementHistory(
    payoutTraderId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Array<{
      id: string;
      type: string;
      amount: number;
      currency: string;
      note: string | null;
      created_at: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;
    const where = { payoutTraderId };

    const [rows, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { currency: { select: { code: true } } },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount),
        currency: r.currency.code,
        note: r.note,
        usdt_address: r.usdtAddress,
        created_at: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit: take,
    };
  }

  async getSpecialistNotifications(payoutTraderId: string, limit = 50) {
      type Row = {
        id: string;
        kind: 'ledger' | 'settlement' | 'order';
        title: string;
        message: string;
        created_at: string;
        reference_id: string | null;
      };

    const [ledger, settlements, orders] = await Promise.all([
      this.prisma.payoutTraderBalanceTransaction.findMany({
        where: { payoutTraderId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { currency: { select: { code: true } } },
      }),
      this.prisma.settlement.findMany({
        where: { payoutTraderId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { currency: { select: { code: true } } },
      }),
      this.prisma.payoutOrder.findMany({
        where: {
          payoutTraderId,
          status: { in: ['COMPLETED', 'FAILED', 'UPLOAD_FAILED'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        include: { currency: { select: { code: true } } },
      }),
    ]);

    const items: Row[] = [];

    for (const t of ledger) {
      items.push({
        id: `ledger:${t.id}`,
        kind: 'ledger',
        title: 'Balance transaction',
        message: `${t.type}: ${Number(t.amount)} ${t.currency.code}`,
        created_at: t.createdAt.toISOString(),
        reference_id: t.referenceId,
      });
    }

    for (const s of settlements) {
      items.push({
        id: `settlement:${s.id}`,
        kind: 'settlement',
        title: 'Settlement',
        message: `${s.type}: ${Number(s.amount)} ${s.currency.code}`,
        created_at: s.createdAt.toISOString(),
        reference_id: s.id,
      });
    }

    for (const o of orders) {
      items.push({
        id: `order:${o.id}`,
        kind: 'order',
        title: `Pay-Out ${o.status}`,
        message: `${o.id} — ${Number(o.amount)} ${o.currency.code}`,
        created_at: o.updatedAt.toISOString(),
        reference_id: o.id,
      });
    }

    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { items: items.slice(0, limit) };
  }

  async exportSpecialistOrdersCsv(payoutTraderId: string, filters: PayoutListFiltersDto): Promise<string> {
    const where = buildAssignedListWhere(
      { kind: 'PAYOUT_TRADER', payoutTraderId },
      filters,
    );
    this.applyPayoutListFilters(where, filters);

    const rows = await this.prisma.payoutOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { currency: { select: { code: true } } },
    });

    const header = ['id', 'request_id', 'status', 'currency', 'amount', 'pool_type', 'created_at_iso'].join(
      ',',
    );
    const lines = rows.map((r) =>
      [
        csvEscape(r.id),
        csvEscape(r.requestId),
        csvEscape(r.status),
        csvEscape(r.currency.code),
        csvEscape(String(Number(r.amount))),
        csvEscape(r.poolType),
        csvEscape(r.createdAt.toISOString()),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  async traderStartProcessing(traderId: string, orderId: string): Promise<PayOutOrderCabinetDto> {
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

    void this.logPayoutStatusChange(orderId, order.status, 'PROCESSING', { actorRole: 'TRADER' });

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  // ─── Internal: traderComplete ───

  async traderComplete(
    traderId: string,
    orderId: string,
    userId: string,
    dto?: SpecialistCompleteDto,
  ): Promise<PayOutOrderCabinetDto> {
    const proofIds = this.normalizeCompletionProofIds(dto);
    if (proofIds.length > MAX_PAYOUT_COMPLETION_PROOF_FILES) {
      throw new BadRequestException(
        `At most ${MAX_PAYOUT_COMPLETION_PROOF_FILES} proof files per order`,
      );
    }
    if (proofIds.length > 0) {
      await this.assertCompletionProofFilesOwned(proofIds, userId);
    }

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
        data: {
          status: 'COMPLETED',
          endAt: new Date(),
        },
      });

      if (
        order.merchantDebitLocal != null &&
        order.parserRate != null &&
        order.rateAdminOut != null
      ) {
        if (order.traderId) {
          await this.settlePayoutV2(tx, order);
        } else if (order.payoutTraderId) {
          await this.settlePayoutV2Specialist(tx, order);
        } else {
          throw new BadRequestException(
            'Pay-Out v2 settlement requires traderId or payoutTraderId on the order.',
          );
        }
      } else {
        throw new BadRequestException(
          'Pay-Out settlement requires v2 fields: merchantDebitLocal, parserRate, and rateAdminOut.',
        );
      }

      await this.createPayoutWebhookEntry(tx, result);
      await this.appendCompletionProofAttachments(tx, orderId, proofIds);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    void this.logPayoutStatusChange(orderId, order.status, 'COMPLETED', { actorRole: 'TRADER' });

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Refund the merchant the locally-debited amount when a Pay-Out is marked FAILED.
   * Symmetric for trader vs specialist failure paths (TZ — settlement on completion only).
   */
  private async refundMerchantOnPayoutFail(
    tx: Prisma.TransactionClient,
    order: Pick<PayoutOrder, 'id' | 'merchantId' | 'currencyId' | 'merchantDebitLocal'>,
  ): Promise<void> {
    if (order.merchantDebitLocal == null) return;
    const refund = Number(order.merchantDebitLocal);
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
        amount: refund,
      },
      update: { amount: { increment: refund } },
    });
    await tx.merchantBalanceTransaction.create({
      data: {
        merchantId: order.merchantId,
        type: MerchantBalanceTransactionType.PAYOUT_REFUND,
        amount: refund,
        currencyId: order.currencyId,
        referenceId: order.id,
        comment: `Pay-out failed refund for order ${order.id}`,
      },
    });
  }

  /**
   * Append completion-proof attachments idempotently and sync the mirrored head column (`completion_proof_file_id`).
   * Returns the merge result so callers can short-circuit on no-ops.
   */
  private async appendCompletionProofAttachments(
    tx: Prisma.TransactionClient,
    orderId: string,
    fileIds: string[],
  ): Promise<{ added: string[] }> {
    if (fileIds.length === 0) return { added: [] };
    const existing = await tx.payoutCompletionProofAttachment.findMany({
      where: { payoutOrderId: orderId },
      select: { fileId: true },
    });
    const existingIds = new Set(existing.map((r) => r.fileId));
    const toAdd = fileIds.filter((id) => !existingIds.has(id));
    if (existing.length + toAdd.length > MAX_PAYOUT_COMPLETION_PROOF_FILES) {
      throw new BadRequestException(
        `At most ${MAX_PAYOUT_COMPLETION_PROOF_FILES} proof files per order`,
      );
    }
    if (toAdd.length > 0) {
      await tx.payoutCompletionProofAttachment.createMany({
        data: toAdd.map((fileId) => ({ payoutOrderId: orderId, fileId })),
        skipDuplicates: true,
      });
      await this.syncPayoutCompletionProofHeadColumn(tx, orderId);
    }
    return { added: toAdd };
  }

  private async assertCompletionProofFileOwned(fileId: string, userId: string): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, uploadedBy: userId },
    });
    if (!file) {
      throw new BadRequestException('Proof file not found or was uploaded by another user');
    }
  }

  /**
   * Standard trader: append completion proof files while the order is PROCESSING or after COMPLETED.
   */
  async traderAttachCompletionProof(
    traderId: string,
    userId: string,
    orderId: string,
    dto: AttachCompletionProofDto,
  ): Promise<PayOutOrderCabinetDto> {
    return this.attachCompletionProofs(
      { kind: 'TRADER', traderId },
      userId,
      orderId,
      dto,
    );
  }

  /**
   * Pay-out specialist: append completion proof files while the order is PROCESSING or after COMPLETED.
   */
  async specialistAttachCompletionProof(
    payoutTraderId: string,
    userId: string,
    orderId: string,
    dto: AttachCompletionProofDto,
  ): Promise<PayOutOrderCabinetDto> {
    return this.attachCompletionProofs(
      { kind: 'PAYOUT_TRADER', payoutTraderId },
      userId,
      orderId,
      dto,
    );
  }

  private async attachCompletionProofs(
    scope: PayoutAssigneeScope,
    userId: string,
    orderId: string,
    dto: AttachCompletionProofDto,
  ): Promise<PayOutOrderCabinetDto> {
    const ids = this.normalizeCompletionProofIds(dto);
    if (ids.length === 0) {
      throw new BadRequestException('At least one proof file id is required');
    }
    await this.assertCompletionProofFilesOwned(ids, userId);

    const notFoundMessage =
      scope.kind === 'TRADER'
        ? 'Order not found, not assigned to this trader, or not in PROCESSING or COMPLETED status'
        : 'Order not found, not assigned to this specialist, or not in PROCESSING or COMPLETED status';

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.payoutOrder.findFirst({
        where: {
          id: orderId,
          ...payoutAssigneeWhereKey(scope),
          status: { in: ['PROCESSING', 'COMPLETED'] },
        },
      });
      if (!order) throw new NotFoundException(notFoundMessage);

      await this.appendCompletionProofAttachments(tx, orderId, ids);

      return tx.payoutOrder.findUniqueOrThrow({ where: { id: orderId } });
    });

    this.emitPayoutOrderRealtime(updated, false);
    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Standard trader: detach one completion proof attachment from an order and physically
   * delete the file when no other record still holds it. Authorized for the assigned trader
   * regardless of order status — traders need to be able to fix a wrong receipt during
   * PROCESSING as well as after COMPLETED.
   */
  async traderDetachCompletionProof(
    traderId: string,
    userRole: string,
    userId: string,
    orderId: string,
    fileId: string,
  ): Promise<PayOutOrderCabinetDto> {
    return this.detachCompletionProof(
      { kind: 'TRADER', traderId },
      userId,
      userRole,
      orderId,
      fileId,
    );
  }

  async specialistDetachCompletionProof(
    payoutTraderId: string,
    userRole: string,
    userId: string,
    orderId: string,
    fileId: string,
  ): Promise<PayOutOrderCabinetDto> {
    return this.detachCompletionProof(
      { kind: 'PAYOUT_TRADER', payoutTraderId },
      userId,
      userRole,
      orderId,
      fileId,
    );
  }

  private async detachCompletionProof(
    scope: PayoutAssigneeScope,
    userId: string,
    userRole: string,
    orderId: string,
    fileId: string,
  ): Promise<PayOutOrderCabinetDto> {
    const notFoundMessage =
      scope.kind === 'TRADER'
        ? 'Order not found or not assigned to this trader'
        : 'Order not found or not assigned to this specialist';

    const removalState = await this.prisma.$transaction(async (tx) => {
      const order = await tx.payoutOrder.findFirst({
        where: { id: orderId, ...payoutAssigneeWhereKey(scope) },
      });
      if (!order) throw new NotFoundException(notFoundMessage);

      const attachment = await tx.payoutCompletionProofAttachment.findFirst({
        where: { payoutOrderId: orderId, fileId },
      });

      const headColumnOnlyMatch = order.completionProofFileId === fileId;
      if (!attachment && !headColumnOnlyMatch) {
        throw new NotFoundException(
          'Completion proof file is not attached to this order',
        );
      }

      if (attachment) {
        await tx.payoutCompletionProofAttachment.delete({
          where: { id: attachment.id },
        });
      }
      await this.syncPayoutCompletionProofHeadColumn(tx, orderId);

      return { orderId, fileId, previousStatus: order.status };
    });

    // S3 + audit cleanup runs outside the DB transaction so a slow S3 endpoint cannot
    // hold a long-lived write lock on the order. `deleteOrphanFile` no-ops when something
    // else still holds the file (e.g. another order's attachment) so this is safe.
    try {
      const refs = await this.files.findFileReferences(fileId);
      if (refs.length === 0) {
        await this.files.deleteOrphanFile(
          { id: userId, role: userRole },
          fileId,
          { skipOwnershipCheck: true },
        );
      } else {
        this.logger.log(
          `Pay-Out ${orderId}: detached proof ${fileId}; file kept (still attached to: ${refs.join(', ')})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Pay-Out ${orderId}: detached proof ${fileId} but file purge failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    await this.audit.log({
      actorId: userId,
      actorRole: userRole,
      action: 'PAYOUT_COMPLETION_PROOF_DETACHED',
      entityType: 'PayoutOrder',
      entityId: orderId,
      oldValue: { fileId, status: removalState.previousStatus },
      newValue: null,
    });

    const order = await this.prisma.payoutOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        traderId: true,
        payoutTraderId: true,
        merchantId: true,
      },
    });
    this.emitPayoutOrderRealtime(order, false);

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  // ─── Internal: traderFail ───

  async traderFail(traderId: string, orderId: string, dto: TraderFailDto): Promise<PayOutOrderCabinetDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId },
    });
    if (!order) throw new NotFoundException('Order not found or not assigned to this trader');

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.FAILED)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> FAILED`,
      );
    }

    let rejectPayload: { reason: PayoutTraderRejectReason; otherNote: string | null };
    try {
      rejectPayload = parsePayoutTraderRejectBody(dto);
    } catch (err) {
      if (err instanceof PayoutTraderRejectPayloadError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    let proofIdsToPurge: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      proofIdsToPurge = await this.unlinkAllCompletionProofsInTx(tx, orderId);

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          endAt: new Date(),
          traderRejectReason: rejectPayload.reason,
          traderRejectOtherNote: rejectPayload.otherNote,
        },
      });

      await this.refundMerchantOnPayoutFail(tx, order);
      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    void this.purgeUnlinkedPayoutProofFiles(proofIdsToPurge);

    this.emitPayoutOrderRealtime(updated, false);

    void this.logPayoutStatusChange(orderId, order.status, 'FAILED', { actorRole: 'TRADER' });

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Standard trader releases assigned work back to the shared PENDING pool (no merchant refund).
   */
  async traderCancelToPool(traderId: string, orderId: string): Promise<PayOutOrderCabinetDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId, poolType: PayoutPoolType.STANDARD },
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found, not assigned to this trader, or not a standard-pool payout',
      );
    }
    if (order.status !== 'NEW' && order.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Return to pool is only allowed from NEW or PROCESSING (current: ${order.status})`,
      );
    }
    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.PENDING)) {
      throw new BadRequestException(`Invalid status transition: ${order.status} -> PENDING`);
    }

    let proofIdsToPurge: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      proofIdsToPurge = await this.unlinkAllCompletionProofsInTx(tx, orderId);

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'PENDING',
          traderId: null,
          startAt: null,
          endAt: null,
          poolAssignedAt: new Date(),
          traderRejectReason: null,
          traderRejectOtherNote: null,
        },
      });
      await this.createPayoutWebhookEntry(tx, result);
      return result;
    });

    void this.purgeUnlinkedPayoutProofFiles(proofIdsToPurge);

    this.emitPayoutOrderRealtime(updated, true);

    void this.logPayoutStatusChange(orderId, order.status, 'PENDING', { actorRole: 'TRADER' });

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Return standard-pool Pay-Out orders assigned to this trader to the unassigned PENDING queue.
   *
   * **Risk:** Emits PENDING webhooks; merchant debit from order creation is unchanged.
   */
  async releaseStandardTraderAssignmentsForDeactivatedProfile(
    traderProfileId: string,
  ): Promise<number> {
    const orders = await this.prisma.payoutOrder.findMany({
      where: {
        traderId: traderProfileId,
        poolType: PayoutPoolType.STANDARD,
        status: { in: [PayoutStatus.NEW, PayoutStatus.PROCESSING] },
      },
    });

    let released = 0;
    for (const order of orders) {
      if (
        !isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.PENDING)
      ) {
        this.logger.warn(
          `Pay-Out ${order.id}: skip return-to-pool on trader deactivation (${order.status} -> PENDING)`,
        );
        continue;
      }

      let proofIdsToPurge: string[] = [];
      const updated = await this.prisma.$transaction(async (tx) => {
        proofIdsToPurge = await this.unlinkAllCompletionProofsInTx(tx, order.id);
        const result = await tx.payoutOrder.update({
          where: { id: order.id },
          data: {
            status: 'PENDING',
            traderId: null,
            startAt: null,
            endAt: null,
            poolAssignedAt: new Date(),
          },
        });

        await this.createPayoutWebhookEntry(tx, result);
        return result;
      });

      void this.purgeUnlinkedPayoutProofFiles(proofIdsToPurge);

      this.emitPayoutOrderRealtime(updated, true);
      released += 1;
    }

    if (released > 0) {
      this.logger.log(
        `Pay-Out: returned ${released} standard-pool order(s) to PENDING for deactivated trader ${traderProfileId}`,
      );
    }

    return released;
  }

  async specialistStartProcessing(
    payoutTraderId: string,
    orderId: string,
  ): Promise<PayOutOrderCabinetDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: {
        id: orderId,
        payoutTraderId,
        status: { in: ['NEW', 'PROCESSING'] },
      },
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found, not assigned to you, or not in NEW/PROCESSING status',
      );
    }

    if (order.status === 'PROCESSING') {
      return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
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

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  async specialistComplete(
    payoutTraderId: string,
    orderId: string,
    specialistUserId: string,
    dto?: SpecialistCompleteDto,
  ): Promise<PayOutOrderCabinetDto> {
    const proofIds = this.normalizeCompletionProofIds(dto);
    if (proofIds.length > MAX_PAYOUT_COMPLETION_PROOF_FILES) {
      throw new BadRequestException(
        `At most ${MAX_PAYOUT_COMPLETION_PROOF_FILES} proof files per order`,
      );
    }
    if (proofIds.length > 0) {
      await this.assertCompletionProofFilesOwned(proofIds, specialistUserId);
    }

    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, payoutTraderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found or not assigned to this specialist');
    }

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.COMPLETED)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} -> COMPLETED`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          endAt: new Date(),
        },
      });

      if (
        order.merchantDebitLocal != null &&
        order.parserRate != null &&
        order.rateAdminOut != null
      ) {
        if (order.payoutTraderId) {
          await this.settlePayoutV2Specialist(tx, order);
        } else {
          throw new BadRequestException(
            'Pay-Out specialist settlement requires payoutTraderId on the order.',
          );
        }
      } else {
        throw new BadRequestException(
          'Pay-Out settlement requires v2 fields: merchantDebitLocal, parserRate, and rateAdminOut.',
        );
      }

      await this.createPayoutWebhookEntry(tx, result);
      await this.appendCompletionProofAttachments(tx, orderId, proofIds);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    void this.logPayoutStatusChange(orderId, order.status, 'COMPLETED', {
      actorRole: 'PAYOUT_TRADER',
    });

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Specialist releases assigned work back to pool B (no merchant refund).
   */
  async specialistCancelToPool(
    payoutTraderId: string,
    orderId: string,
  ): Promise<PayOutOrderCabinetDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, payoutTraderId, poolType: PayoutPoolType.PAYOUT_SPECIALIST },
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found, not assigned to this specialist, or not a specialist-pool payout',
      );
    }
    if (order.status !== 'NEW' && order.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Return to pool is only allowed from NEW or PROCESSING (current: ${order.status})`,
      );
    }
    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.PENDING)) {
      throw new BadRequestException(`Invalid status transition: ${order.status} -> PENDING`);
    }

    let proofIdsToPurge: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      proofIdsToPurge = await this.unlinkAllCompletionProofsInTx(tx, orderId);

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'PENDING',
          payoutTraderId: null,
          traderId: null,
          startAt: null,
          endAt: null,
          poolAssignedAt: new Date(),
          traderRejectReason: null,
          traderRejectOtherNote: null,
        },
      });
      await this.createPayoutWebhookEntry(tx, result);
      return result;
    });

    void this.purgeUnlinkedPayoutProofFiles(proofIdsToPurge);

    this.emitPayoutOrderRealtime(updated, true);

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  async specialistFail(
    payoutTraderId: string,
    orderId: string,
    dto: TraderFailDto,
  ): Promise<PayOutOrderCabinetDto> {
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, payoutTraderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found or not assigned to this specialist');
    }

    if (order.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Reject (fail) is only allowed from PROCESSING (current: ${order.status})`,
      );
    }

    if (!isValidPayOutTransition(order.status as PayOutOrderStatus, PayOutOrderStatus.FAILED)) {
      throw new BadRequestException(`Invalid status transition: ${order.status} -> FAILED`);
    }

    let rejectPayload: { reason: PayoutTraderRejectReason; otherNote: string | null };
    try {
      rejectPayload = parsePayoutTraderRejectBody(dto);
    } catch (err) {
      if (err instanceof PayoutTraderRejectPayloadError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    let proofIdsToPurge: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      proofIdsToPurge = await this.unlinkAllCompletionProofsInTx(tx, orderId);

      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          endAt: new Date(),
          traderRejectReason: rejectPayload.reason,
          traderRejectOtherNote: rejectPayload.otherNote,
        },
      });

      await this.refundMerchantOnPayoutFail(tx, order);
      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    void this.purgeUnlinkedPayoutProofFiles(proofIdsToPurge);

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderCabinetDto(await this.loadCabinetOrder(orderId));
  }

  // ─── Private helpers ───

  /**
   * RISK NOTE: Pay-Out v2 specialist — same USDT credit formula as standard traders; balance on payout_traders.
   */
  private async settlePayoutV2Specialist(
    tx: Prisma.TransactionClient,
    order: PayoutOrderScalars,
  ): Promise<void> {
    if (!order.payoutTraderId || order.parserRate == null || order.rateAdminOut == null) {
      throw new BadRequestException('Payout v2 specialist settlement: missing profile or rate snapshot');
    }

    const profile = await tx.payoutTraderProfile.findUnique({
      where: { id: order.payoutTraderId },
    });
    if (!profile) {
      throw new BadRequestException('Pay-Out specialist not found for payout settlement');
    }

    if (profile.exchangeParser) {
      this.logger.debug(
        `Payout v2 specialist ${order.id}: profile exchange_parser="${profile.exchangeParser}" (USDT credit uses stored order.parserRate)`,
      );
    }

    const P = Number(order.parserRate);
    const amountLocal = Number(order.amount);
    const rateTraderOutVal = rateTraderOut(P, Number(profile.payoutRate));
    const rateAdminOutVal = Number(order.rateAdminOut);
    const creditUsdtVal = creditUsdtPayout(amountLocal, rateTraderOutVal);
    const marginUsdt = platformMarginUsdtPayout(amountLocal, rateAdminOutVal, rateTraderOutVal);
    const marginLocal = platformMarginLocal(marginUsdt, P);
    const merchantFrac = percentToFraction(Number(order.percentFee));

    await tx.payoutOrder.update({
      where: { id: order.id },
      data: { rateTraderOut: rateTraderOutVal },
    });

    await tx.payoutTraderProfile.update({
      where: { id: order.payoutTraderId },
      data: { balanceUsdt: { increment: creditUsdtVal } },
    });

    const usdtId = await this.currencies.getUsdtCurrencyId();
    await tx.payoutTraderBalanceTransaction.create({
      data: {
        payoutTraderId: order.payoutTraderId,
        type: PayoutTraderBalanceTxType.PAYOUT_CREDIT,
        amount: creditUsdtVal,
        currencyId: usdtId,
        referenceId: order.id,
        comment: `Pay-out USDT credit for order ${order.id}`,
      },
    });

    await tx.platformIncome.create({
      data: {
        orderId: order.id,
        orderType: PlatformIncomeOrderType.PAYOUT,
        merchantId: order.merchantId,
        traderId: null,
        orderAmountLocal: amountLocal,
        parserRate: P,
        rateTrader: rateTraderOutVal,
        rateAdmin: rateAdminOutVal,
        traderRatePct: Number(profile.payoutRate),
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeLocal: marginLocal,
      },
    });

    this.logger.log(
      `Payout v2 specialist settled ${order.id}: specialist +${creditUsdtVal} USDT, platform +${marginUsdt} USDT`,
    );
  }

  /**
   * RISK NOTE: Fiat Pay-Out v2 — merchant was debited at order creation; credit trader USDT and book platform margin.
   */
  private async settlePayoutV2(tx: Prisma.TransactionClient, order: PayoutOrderScalars): Promise<void> {
    if (!order.traderId || order.parserRate == null || order.rateAdminOut == null) {
      throw new BadRequestException('Payout v2 settlement: missing trader or rate snapshot');
    }

    const usdtId = await this.currencies.getUsdtCurrencyId();

    const trader = await tx.traderProfile.findUnique({ where: { id: order.traderId } });
    if (!trader) {
      throw new BadRequestException('Trader not found for payout settlement');
    }

    const P = Number(order.parserRate);
    const amountLocal = Number(order.amount);
    const rateTraderOutVal = rateTraderOut(P, Number(trader.payoutRate));
    const rateAdminOutVal = Number(order.rateAdminOut);
    const creditUsdtVal = creditUsdtPayout(amountLocal, rateTraderOutVal);
    const marginUsdt = platformMarginUsdtPayout(amountLocal, rateAdminOutVal, rateTraderOutVal);
    const marginLocal = platformMarginLocal(marginUsdt, P);
    const merchantFrac = percentToFraction(Number(order.percentFee));

    await tx.payoutOrder.update({
      where: { id: order.id },
      data: { rateTraderOut: rateTraderOutVal },
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
        orderAmountLocal: amountLocal,
        parserRate: P,
        rateTrader: rateTraderOutVal,
        rateAdmin: rateAdminOutVal,
        traderRatePct: Number(trader.payoutRate),
        merchantCommissionPct: merchantFrac,
        incomeUsdt: marginUsdt,
        incomeLocal: marginLocal,
      },
    });

    this.logger.log(
      `Payout v2 settled ${order.id}: trader +${creditUsdtVal} USDT, platform +${marginUsdt} USDT`,
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
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async createPayoutWebhookEntry(
    tx: Prisma.TransactionClient,
    order: Pick<PayoutOrder, 'id' | 'requestId' | 'status' | 'amount' | 'callbackUrl'>,
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

  private toPayOutOrderApiDto(
    order: PayoutOrderApiSource,
    opts?: { poolListing?: boolean; poolCloseDeadline?: Date | null },
  ): PayOutOrderApiDto {
    const details: DetailsDto = {
      type: order.detailsType as any,
      number: order.detailsNumber,
      owner: order.detailsOwner ?? undefined,
      code: order.detailsCode ?? undefined,
    };

    const parserRateVal = order.parserRate != null ? Number(order.parserRate) : null;
    const amountNum = Number(order.amount);
    const amountUsdtEstimate =
      parserRateVal != null && parserRateVal > 0 ? amountNum / parserRateVal : null;
    const paymentMethodName =
      'paymentMethod' in order && order.paymentMethod
        ? order.paymentMethod.displayName
        : null;

    const poolAssignedUnix = order.poolAssignedAt
      ? Math.floor(order.poolAssignedAt.getTime() / 1000)
      : null;

    const proofIdsOrdered = this.completionProofIdsFromOrder(order);

    const base: PayOutOrderApiDto = {
      id: order.id,
      request_id: order.requestId,
      created_at: Math.floor(order.createdAt.getTime() / 1000),
      start_at: order.startAt ? Math.floor(order.startAt.getTime() / 1000) : null,
      end_at: order.endAt ? Math.floor(order.endAt.getTime() / 1000) : null,
      currency: order.currency.code,
      details,
      amount: amountNum,
      status: order.status as PayOutOrderStatus,
      rate: Number(order.rate),
      partner_amount: Number(order.partnerAmount),
      percent_fee: Number(order.percentFee),
      pool_type: order.poolType,
      ...(proofIdsOrdered.length > 0
        ? {
            completion_proof_file_ids: proofIdsOrdered,
            completion_proof_file_id: proofIdsOrdered[0],
          }
        : {}),
      pool_assigned_at: poolAssignedUnix,
      parser_rate: parserRateVal,
      amount_usdt_estimate: amountUsdtEstimate,
      payment_method_name: paymentMethodName,
      trader_reject_reason: order.traderRejectReason
        ? (order.traderRejectReason as unknown as PayoutTraderRejectReasonApi)
        : order.traderRejectReason === null
          ? null
          : undefined,
      trader_reject_other_note: order.traderRejectOtherNote ?? null,
    };

    if (!opts?.poolListing) {
      return base;
    }

    return {
      ...base,
      requisites_visible: false,
      request_id: '',
      details: {
        type: order.detailsType as any,
        number: '—',
        owner: undefined,
        code: undefined,
      },
      payment_method_name: null,
      parser_rate: null,
      amount_usdt_estimate: null,
      pool_close_deadline_at: opts.poolCloseDeadline
        ? Math.floor(opts.poolCloseDeadline.getTime() / 1000)
        : null,
    };
  }

  private toPayOutOrderCabinetDto(
    order: PayoutOrderApiSource,
    opts?: { poolListing?: boolean; poolCloseDeadline?: Date | null },
  ): PayOutOrderCabinetDto {
    const full = this.toPayOutOrderApiDto(order, opts);
    const details: PayOutOrderCabinetDto['details'] = {
      number: full.details.number,
      ...(full.details.owner ? { owner: full.details.owner } : {}),
    };

    const cabinet: PayOutOrderCabinetDto = {
      id: full.id,
      created_at: full.created_at,
      start_at: full.start_at,
      currency: full.currency,
      details,
      amount: full.amount,
      status: full.status,
      ...(full.completion_proof_file_ids?.length
        ? {
            completion_proof_file_ids: full.completion_proof_file_ids,
            completion_proof_file_id: full.completion_proof_file_id,
          }
        : {}),
      ...(full.pool_close_deadline_at != null
        ? { pool_close_deadline_at: full.pool_close_deadline_at }
        : {}),
      ...(full.requisites_visible === false ? { requisites_visible: false } : {}),
      ...(full.amount_usdt_estimate != null
        ? { amount_usdt_estimate: full.amount_usdt_estimate }
        : {}),
      ...(full.payment_method_name != null
        ? { payment_method_name: full.payment_method_name }
        : {}),
    };

    return cabinet;
  }

  async getPayoutOrderStatusHistoryForTrader(
    traderId: string,
    orderId: string,
  ): Promise<OrderStatusHistoryEntry[]> {
    const order = await this.resolvePayoutOrderForTraderStatusHistory(traderId, orderId);
    return this.buildPayoutOrderStatusHistory(order);
  }

  async getPayoutOrderStatusHistoryForSpecialist(
    payoutTraderId: string,
    orderId: string,
  ): Promise<OrderStatusHistoryEntry[]> {
    const order = await this.resolvePayoutOrderForSpecialistStatusHistory(
      payoutTraderId,
      orderId,
    );
    return this.buildPayoutOrderStatusHistory(order);
  }

  private async buildPayoutOrderStatusHistory(order: {
    id: string;
    status: string;
    createdAt: Date;
  }): Promise<OrderStatusHistoryEntry[]> {
    const history = await fetchOrderStatusHistory(this.prisma, order.id, {
      orderCreatedAt: order.createdAt,
    });
    return withOrderStatusHistoryFallback(history, {
      status: order.status,
      createdAt: order.createdAt,
    });
  }

  /**
   * Traders may view status history for assigned orders or unassigned pool orders
   * they are allowed to see (same visibility rules as getPool / take-from-pool).
   */
  private async resolvePayoutOrderForTraderStatusHistory(
    traderId: string,
    orderId: string,
  ): Promise<{ id: string; status: string; createdAt: Date }> {
    const order = await this.prisma.payoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        traderId: true,
        payoutTraderId: true,
        poolType: true,
        amount: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.traderId === traderId) {
      return order;
    }

    if (
      order.status !== PayoutStatus.PENDING ||
      order.traderId != null ||
      order.payoutTraderId != null ||
      order.poolType !== PayoutPoolType.STANDARD
    ) {
      throw new NotFoundException('Order not found');
    }

    const trader = await this.prisma.traderProfile.findUnique({
      where: { id: traderId },
      include: { user: { select: { isActive: true } } },
    });
    if (!trader?.user?.isActive || !trader.isActive || !trader.acceptingOrders) {
      throw new NotFoundException('Order not found');
    }

    const amount = Number(order.amount);
    const minLimit = Number(trader.payoutMinLimit);
    const maxLimit = Number(trader.payoutMaxLimit);
    if (minLimit > 0 && amount < minLimit) {
      throw new NotFoundException('Order not found');
    }
    if (maxLimit > 0 && amount > maxLimit) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Pay-Out specialists may view status history for assigned orders or pool B listings
   * visible in getSpecialistPool.
   */
  private async resolvePayoutOrderForSpecialistStatusHistory(
    payoutTraderId: string,
    orderId: string,
  ): Promise<{ id: string; status: string; createdAt: Date }> {
    const order = await this.prisma.payoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        traderId: true,
        payoutTraderId: true,
        poolType: true,
        currency: { select: { code: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.payoutTraderId === payoutTraderId) {
      return order;
    }

    if (
      order.status !== PayoutStatus.PENDING ||
      order.traderId != null ||
      order.payoutTraderId != null ||
      order.poolType !== PayoutPoolType.PAYOUT_SPECIALIST
    ) {
      throw new NotFoundException('Order not found');
    }

    const profile = await this.prisma.payoutTraderProfile.findUnique({
      where: { id: payoutTraderId },
      include: {
        country: { include: { currency: true } },
        user: { select: { isActive: true } },
      },
    });
    if (!profile?.user?.isActive || !profile.isActive) {
      throw new NotFoundException('Order not found');
    }

    if (order.currency.code !== profile.country.currency.code) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getPayoutOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    const order = await this.prisma.payoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.buildPayoutOrderStatusHistory(order);
  }

  private logPayoutOrderCreated(orderId: string, status: string): void {
    const { fromStatus, note } = initialOrderStatusAuditFrom(status);
    void this.logPayoutStatusChange(orderId, fromStatus, status, {
      actorRole: 'MERCHANT',
      note,
    });
  }

  private logPayoutStatusChange(
    orderId: string,
    fromStatus: string,
    toStatus: string,
    ctx: { actorId?: string; actorRole?: string; note?: string } = {},
  ): void {
    void recordOrderStatusChange(this.audit, {
      entityType: OrderStatusHistoryEntity.payout,
      orderId,
      fromStatus,
      toStatus,
      actorId: ctx.actorId ?? null,
      actorRole: ctx.actorRole ?? null,
      note: ctx.note ?? null,
    }).catch(() => undefined);
  }
}

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
} from '@p2p/shared';
import type { PayOutOrderApiDto, ProfileDto, DetailsDto } from '@p2p/shared';
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
import { validateCallbackUrl } from '../../common/utils/url-validator';
import { assertAmountWithinDirectionMinMax } from '../../common/utils/direction-amount-limits.util';
import { BalanceTransactionsService } from '../balance-transactions/balance-transactions.service';
import { MerchantDirectionsService } from '../merchant-directions/merchant-directions.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { TelegramService } from '../telegram/telegram.service';
import { CurrenciesService } from '../currencies/currencies.service';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import { resolveStatisticsWindow } from '../../common/utils/statistics-window';
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

const CABINET_ORDER_INCLUDE = {
  paymentMethod: { select: { displayName: true } },
  currency: { select: { code: true } },
} as const;

const ORDER_INCLUDE = {
  currency: { select: { code: true } },
} as const;

/** Singleton row for global pool B share (see migration seed). */
const PAYOUT_POOL_SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';

type _CabinetPayload = Prisma.PayoutOrderGetPayload<{ include: typeof CABINET_ORDER_INCLUDE }>;
type PayoutOrderRow = Prisma.PayoutOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type PayoutOrderApiSource = PayoutOrderRow | _CabinetPayload;
/** Full payout order row for v2 settlement (no required relation beyond scalars). */
type PayoutOrderScalars = PayoutOrder;

function enumerateDaysUTC(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function statusRecordToLowercase(
  rows: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const rec: Record<string, number> = {};
  for (const r of rows) {
    rec[r.status.toLowerCase()] = r._count._all;
  }
  return rec;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

    if (filters.min_amount == null && filters.max_amount == null) return;

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
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { balances: { include: { currency: true } } },
    });

    const direction = await this.prisma.direction.findFirst({
      where: { type: DirectionType.PAYOUT, isOnline: true },
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
        this.toPayOutOrderApiDto(o, {
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
        this.toPayOutOrderApiDto(o, {
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

  async traderTakeFromPool(traderId: string, orderId: string): Promise<PayOutOrderApiDto> {
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

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  async specialistTakeFromPool(
    payoutTraderId: string,
    orderId: string,
  ): Promise<PayOutOrderApiDto> {
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

    const full = await this.loadCabinetOrder(orderId);
    return this.toPayOutOrderApiDto(full);
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

    const full = await this.loadCabinetOrder(orderId);
    return this.toPayOutOrderApiDto(full);
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
      orders: items.map((o) => this.toPayOutOrderApiDto(o)),
      total,
      page,
      limit,
    };
  }

  async getSpecialistOrders(payoutTraderId: string, filters: PayoutListFiltersDto) {
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
      payoutTraderId,
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
    };

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
      orders: items.map((o) => this.toPayOutOrderApiDto(o)),
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
      payoutTraderId,
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
    };

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

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  // ─── Internal: traderComplete ───

  async traderComplete(
    traderId: string,
    orderId: string,
    userId: string,
    dto?: SpecialistCompleteDto,
  ): Promise<PayOutOrderApiDto> {
    const proofId = dto?.completion_proof_file_id;
    if (proofId) {
      const file = await this.prisma.file.findFirst({
        where: { id: proofId, uploadedBy: userId },
      });
      if (!file) {
        throw new BadRequestException('Proof file not found or was uploaded by another user');
      }
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
          ...(proofId ? { completionProofFileId: proofId } : {}),
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

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
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
   * Standard trader: set or replace completion proof after the order is already COMPLETED.
   */
  async traderAttachCompletionProof(
    traderId: string,
    userId: string,
    orderId: string,
    dto: AttachCompletionProofDto,
  ): Promise<PayOutOrderApiDto> {
    await this.assertCompletionProofFileOwned(dto.completion_proof_file_id, userId);
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, traderId, status: 'COMPLETED' },
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found, not assigned to this trader, or not in COMPLETED status',
      );
    }

    const updated = await this.prisma.payoutOrder.update({
      where: { id: orderId },
      data: { completionProofFileId: dto.completion_proof_file_id },
    });

    this.emitPayoutOrderRealtime(updated, false);
    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Pay-out specialist: set or replace completion proof after the order is already COMPLETED.
   */
  async specialistAttachCompletionProof(
    payoutTraderId: string,
    userId: string,
    orderId: string,
    dto: AttachCompletionProofDto,
  ): Promise<PayOutOrderApiDto> {
    await this.assertCompletionProofFileOwned(dto.completion_proof_file_id, userId);
    const order = await this.prisma.payoutOrder.findFirst({
      where: { id: orderId, payoutTraderId, status: 'COMPLETED' },
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found, not assigned to this specialist, or not in COMPLETED status',
      );
    }

    const updated = await this.prisma.payoutOrder.update({
      where: { id: orderId },
      data: { completionProofFileId: dto.completion_proof_file_id },
    });

    this.emitPayoutOrderRealtime(updated, false);
    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  // ─── Internal: traderFail ───

  async traderFail(traderId: string, orderId: string, dto: TraderFailDto): Promise<PayOutOrderApiDto> {
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          endAt: new Date(),
          traderRejectReason: rejectPayload.reason,
          traderRejectOtherNote: rejectPayload.otherNote,
        },
      });

      if (order.merchantDebitLocal != null) {
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

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Standard trader releases assigned work back to the shared PENDING pool (no merchant refund).
   */
  async traderCancelToPool(traderId: string, orderId: string): Promise<PayOutOrderApiDto> {
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

    const updated = await this.prisma.$transaction(async (tx) => {
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

    this.emitPayoutOrderRealtime(updated, true);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
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

      const updated = await this.prisma.$transaction(async (tx) => {
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
  ): Promise<PayOutOrderApiDto> {
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
      return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
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

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  async specialistComplete(
    payoutTraderId: string,
    orderId: string,
    specialistUserId: string,
    dto?: SpecialistCompleteDto,
  ): Promise<PayOutOrderApiDto> {
    const proofId = dto?.completion_proof_file_id;
    if (proofId) {
      const file = await this.prisma.file.findFirst({
        where: { id: proofId, uploadedBy: specialistUserId },
      });
      if (!file) {
        throw new BadRequestException('Proof file not found or was uploaded by another user');
      }
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
          ...(proofId ? { completionProofFileId: proofId } : {}),
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

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  /**
   * Specialist releases assigned work back to pool B (no merchant refund).
   */
  async specialistCancelToPool(
    payoutTraderId: string,
    orderId: string,
  ): Promise<PayOutOrderApiDto> {
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

    const updated = await this.prisma.$transaction(async (tx) => {
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

    this.emitPayoutOrderRealtime(updated, true);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
  }

  async specialistFail(
    payoutTraderId: string,
    orderId: string,
    dto: TraderFailDto,
  ): Promise<PayOutOrderApiDto> {
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          endAt: new Date(),
          traderRejectReason: rejectPayload.reason,
          traderRejectOtherNote: rejectPayload.otherNote,
        },
      });

      if (order.merchantDebitLocal != null) {
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

      await this.createPayoutWebhookEntry(tx, result);

      return result;
    });

    this.emitPayoutOrderRealtime(updated, false);

    return this.toPayOutOrderApiDto(await this.loadCabinetOrder(orderId));
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
      completion_proof_file_id: order.completionProofFileId ?? undefined,
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
}

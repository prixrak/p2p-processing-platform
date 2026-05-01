import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DirectionType } from '@prisma/client';
import { CurrenciesService } from '../currencies/currencies.service';
import {
  CreateMerchantDirectionDto,
  UpdateMerchantDirectionDto,
  UpsertCommissionTiersDto,
} from './dto/merchant-direction.dto';
import type { Currency, MerchantDirection } from '@prisma/client';

type MerchantDirectionWithCurrency = MerchantDirection & { currency: Currency };

@Injectable()
export class MerchantDirectionsService {
  private readonly logger = new Logger(MerchantDirectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

  private toApiMerchantDirection(row: MerchantDirectionWithCurrency) {
    const { currency, ...rest } = row;
    return {
      ...rest,
      currency: currency.code,
    };
  }

  private dirInclude() {
    return {
      commissionTiers: { orderBy: { amountFrom: 'asc' as const } },
      paymentMethod: true,
      currency: true,
    } as const;
  }

  // ── CRUD: Merchant Directions ───────────────────────────────────────────────

  async findByMerchant(merchantId: string) {
    const rows = await this.prisma.merchantDirection.findMany({
      where: { merchantId },
      include: this.dirInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toApiMerchantDirection(r as MerchantDirectionWithCurrency));
  }

  async findOne(id: string) {
    const dir = await this.prisma.merchantDirection.findUnique({
      where: { id },
      include: this.dirInclude(),
    });
    if (!dir) throw new NotFoundException(`MerchantDirection ${id} not found`);
    return this.toApiMerchantDirection(dir as MerchantDirectionWithCurrency);
  }

  async create(merchantId: string, dto: CreateMerchantDirectionDto) {
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);
    const existing = await this.prisma.merchantDirection.findUnique({
      where: {
        merchantId_directionType_currencyId: {
          merchantId,
          directionType: dto.directionType,
          currencyId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Direction ${dto.directionType}/${dto.currency} already exists for this merchant`,
      );
    }

    const { tiers, ...rest } = dto;

    const created = await this.prisma.merchantDirection.create({
      data: {
        merchantId,
        directionType: rest.directionType,
        currencyId,
        minAmount: rest.minAmount ?? 0,
        maxAmount: rest.maxAmount ?? 0,
        defaultCommissionPercent: rest.defaultCommissionPercent ?? 0,
        paymentMethodId: rest.paymentMethodId,
        commissionTiers: tiers?.length
          ? {
              create: tiers.map((t) => ({
                amountFrom: t.amountFrom,
                amountTo: t.amountTo,
                commissionPercent: t.commissionPercent,
              })),
            }
          : undefined,
      },
      include: this.dirInclude(),
    });
    return this.toApiMerchantDirection(created as MerchantDirectionWithCurrency);
  }

  async update(id: string, dto: UpdateMerchantDirectionDto) {
    await this.findOne(id);
    const updated = await this.prisma.merchantDirection.update({
      where: { id },
      data: {
        ...(dto.minAmount !== undefined ? { minAmount: dto.minAmount } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount } : {}),
        ...(dto.defaultCommissionPercent !== undefined
          ? { defaultCommissionPercent: dto.defaultCommissionPercent }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.paymentMethodId !== undefined ? { paymentMethodId: dto.paymentMethodId } : {}),
      },
      include: this.dirInclude(),
    });
    return this.toApiMerchantDirection(updated as MerchantDirectionWithCurrency);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.merchantDirection.delete({ where: { id } });
  }

  // ── Commission Tiers ────────────────────────────────────────────────────────

  /**
   * Replaces all tiers for a direction atomically.
   * RISK NOTE: This truncates and rewrites all tiers in a single transaction.
   */
  async upsertTiers(directionId: string, dto: UpsertCommissionTiersDto) {
    await this.findOne(directionId);

    return this.prisma.$transaction(async (tx) => {
      await tx.merchantCommissionTier.deleteMany({ where: { merchantDirectionId: directionId } });

      if (dto.tiers.length > 0) {
        await tx.merchantCommissionTier.createMany({
          data: dto.tiers.map((t) => ({
            merchantDirectionId: directionId,
            amountFrom: t.amountFrom,
            amountTo: t.amountTo,
            commissionPercent: t.commissionPercent,
          })),
        });
      }

      const row = await tx.merchantDirection.findUnique({
        where: { id: directionId },
        include: this.dirInclude(),
      });
      return row ? this.toApiMerchantDirection(row as MerchantDirectionWithCurrency) : null;
    });
  }

  // ── Commission Lookup (used by payin/payout services) ──────────────────────

  /**
   * Returns the effective commission % for a given merchant + directionType + amount.
   * Priority: matching tier → merchantDirection.defaultCommissionPercent → null (caller falls back to global).
   */
  async getEffectiveCommissionPercent(
    merchantId: string,
    directionType: DirectionType,
    currency: string,
    amount: number,
  ): Promise<number | null> {
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(currency);
    const direction = await this.prisma.merchantDirection.findUnique({
      where: {
        merchantId_directionType_currencyId: { merchantId, directionType, currencyId },
      },
      include: { commissionTiers: { orderBy: { amountFrom: 'asc' } } },
    });

    if (!direction || !direction.isActive) return null;

    const matchingTier = direction.commissionTiers.find((t) => {
      const from = Number(t.amountFrom);
      const to = t.amountTo !== null ? Number(t.amountTo) : Infinity;
      return amount >= from && amount <= to;
    });

    if (matchingTier) return Number(matchingTier.commissionPercent);
    return Number(direction.defaultCommissionPercent);
  }
}

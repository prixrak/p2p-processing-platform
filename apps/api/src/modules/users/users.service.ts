import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@p2p/shared';
import { Prisma, TraderProcessingMethod } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { hashPassword } from '../../common/utils/password';
import { TraderWalletsService } from '../trader-wallets/trader-wallets.service';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';
import { CurrenciesService } from '../currencies/currencies.service';
import { TradersService } from '../traders/traders.service';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const USER_LIST_INCLUDE = {
  merchant: { select: { id: true, name: true, isLock: true } },
  traderProfile: {
    select: {
      id: true,
      isActive: true,
      payoutMinLimit: true,
      payoutMaxLimit: true,
    },
  },
  payoutTraderProfile: { select: { id: true } },
  referralProfile: {
    select: {
      id: true,
      referralPercent: true,
      balance: true,
      currency: { select: { code: true } },
      _count: { select: { referrals: true } },
    },
  },
} as const;

type UserListWithInclude = Prisma.UserGetPayload<{ include: typeof USER_LIST_INCLUDE }>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly traderWallets: TraderWalletsService,
    private readonly currencies: CurrenciesService,
    private readonly tradersService: TradersService,
  ) {}

  /** Roles hidden from the directory for the viewer (hierarchy / peer isolation). */
  private directoryExcludedRoles(viewerRole: UserRole): UserRole[] {
    if (viewerRole === UserRole.OWNER) return [UserRole.OWNER];
    if (viewerRole === UserRole.ADMIN) return [UserRole.OWNER, UserRole.ADMIN];
    return [UserRole.OWNER];
  }

  private buildUserListWhere(
    filters: {
      search?: string;
      role?: UserRole;
      isActive?: boolean;
    },
    excludedRoles: UserRole[],
  ): { base: Prisma.UserWhereInput; list: Prisma.UserWhereInput } {
    const roleClause: Prisma.UserWhereInput =
      excludedRoles.length === 1
        ? { role: { not: excludedRoles[0] } }
        : { role: { notIn: excludedRoles } };

    const and: Prisma.UserWhereInput[] = [roleClause];

    const trimmed = filters.search?.trim();
    if (trimmed) {
      and.push({ email: { contains: trimmed, mode: 'insensitive' } });
    }
    if (filters.role) {
      if (excludedRoles.includes(filters.role)) {
        and.push({ id: { in: [] } });
      } else {
        and.push({ role: filters.role });
      }
    }

    const base: Prisma.UserWhereInput = { AND: and };

    const list: Prisma.UserWhereInput = { ...base };
    if (filters.isActive !== undefined) {
      list.isActive = filters.isActive;
    }
    return { base, list };
  }

  /**
   * Referral-role users must have a ReferralProfile row. Older or inconsistent data may omit it;
   * repair on directory read so staff UI always sees commission, balance, and link actions.
   */
  private async backfillMissingReferralProfiles(rows: UserListWithInclude[]): Promise<UserListWithInclude[]> {
    const missing = rows.filter((u) => u.role === UserRole.REFERRAL && !u.referralProfile);
    if (missing.length === 0) return rows;

    this.logger.warn(
      `Referral users without profile on directory read (repairing): ${missing.map((u) => u.id).join(', ')}`,
    );
    const uahId = await this.currencies.requireActiveCurrencyIdByCode('UAH');
    await Promise.all(
      missing.map((u) =>
        this.prisma.referralProfile.upsert({
          where: { userId: u.id },
          create: { userId: u.id, referralPercent: 0, currencyId: uahId },
          update: {},
        }),
      ),
    );

    const profiles = await this.prisma.referralProfile.findMany({
      where: { userId: { in: missing.map((m) => m.id) } },
      select: {
        userId: true,
        id: true,
        referralPercent: true,
        balance: true,
        currency: { select: { code: true } },
        _count: { select: { referrals: true } },
      },
    });

    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    return rows.map((u) => {
      if (u.role !== UserRole.REFERRAL || u.referralProfile) return u;
      const p = profileByUserId.get(u.id);
      if (!p) return u;
      return {
        ...u,
        referralProfile: {
          id: p.id,
          referralPercent: p.referralPercent,
          balance: p.balance,
          currency: p.currency,
          _count: p._count,
        },
      };
    });
  }

  /**
   * HMAC routes reject locked merchants. Staff user flag drives merchant lock:
   * inactive user → lock; reactivation (was inactive, now active) → unlock.
   * Does not clear a manual lock on an already-active merchant (e.g. email-only PATCH).
   */
  /** Side effects when a cabinet account is disabled (soft delete / deactivate). */
  private async applyUserDeactivationSideEffects(
    userId: string,
    role: UserRole,
    previousIsActive: boolean,
  ) {
    if (role === UserRole.TRADER) {
      const profile = await this.prisma.traderProfile.findUnique({
        where: { userId },
        select: { id: true, isActive: true },
      });
      if (profile?.isActive) {
        await this.tradersService.deactivate(profile.id);
      }
    }

    if (role === UserRole.PAYOUT_TRADER) {
      const result = await this.prisma.payoutTraderProfile.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
      if (result.count > 0) {
        this.logger.warn(`Pay-Out specialist profile for user ${userId} deactivated`);
      }
    }

    await this.syncMerchantLockWithLinkedUser(userId, role, false, previousIsActive);
  }

  private async syncMerchantLockWithLinkedUser(
    userId: string,
    role: UserRole,
    isActive: boolean,
    previousIsActive: boolean,
  ) {
    if (role !== UserRole.MERCHANT) return;

    if (!isActive) {
      const result = await this.prisma.merchant.updateMany({
        where: { userId, isLock: false },
        data: { isLock: true },
      });
      if (result.count > 0) {
        this.logger.warn(`Merchant for user ${userId} locked automatically (inactive user)`);
      }
      return;
    }

    if (previousIsActive === false) {
      const result = await this.prisma.merchant.updateMany({
        where: { userId, isLock: true },
        data: { isLock: false },
      });
      if (result.count > 0) {
        this.logger.log(`Merchant for user ${userId} unlocked automatically (user reactivated)`);
      }
    }
  }

  private mapDirectoryUserRow(u: UserListWithInclude) {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      merchant: u.merchant,
      traderProfile: u.traderProfile
        ? {
            id: u.traderProfile.id,
            isActive: u.traderProfile.isActive,
            payoutMinLimit: Number(u.traderProfile.payoutMinLimit),
            payoutMaxLimit: Number(u.traderProfile.payoutMaxLimit),
          }
        : null,
      payoutTraderProfile: u.payoutTraderProfile,
      referralProfile: u.referralProfile
        ? {
            id: u.referralProfile.id,
            referralPercent: Number(u.referralProfile.referralPercent),
            balance: Number(u.referralProfile.balance),
            currencyCode: u.referralProfile.currency.code,
            linkedCount: u.referralProfile._count.referrals,
          }
        : null,
    };
  }

  async findAll(query: ListUsersQueryDto, viewerRole: UserRole) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const excludedRoles = this.directoryExcludedRoles(viewerRole);
    const { base, list: where } = this.buildUserListWhere(
      {
        search: query.search,
        role: query.role,
        isActive: query.isActive,
      },
      excludedRoles,
    );

    const [rows, total, groupRows] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: USER_LIST_INCLUDE,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({ by: ['role'], where, _count: { _all: true } }),
    ]);

    const rowsWithReferralProfiles = await this.backfillMissingReferralProfiles(rows);

    let activeCount: number;
    let inactiveCount: number;
    if (query.isActive === undefined) {
      [activeCount, inactiveCount] = await Promise.all([
        this.prisma.user.count({ where: { ...base, isActive: true } }),
        this.prisma.user.count({ where: { ...base, isActive: false } }),
      ]);
    } else if (query.isActive === true) {
      activeCount = total;
      inactiveCount = 0;
    } else {
      activeCount = 0;
      inactiveCount = total;
    }

    const byRole = Object.values(UserRole).reduce(
      (acc, role) => {
        acc[role] = 0;
        return acc;
      },
      {} as Record<UserRole, number>,
    );
    for (const row of groupRows) {
      byRole[row.role] = row._count._all;
    }

    return {
      data: rowsWithReferralProfiles.map((u) => this.mapDirectoryUserRow(u)),
      total,
      page,
      limit,
      stats: { activeCount, inactiveCount, byRole },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });
  }

  async create(
    email: string,
    password: string,
    role: UserRole,
    opts?: {
      countryId?: string;
      payoutRate?: number;
      overdraftLimitUsdt?: number;
      payinRate?: number;
      traderPayoutRate?: number;
      payoutMinLimit?: number;
      payoutMaxLimit?: number;
      processingMethod?: TraderProcessingMethod;
      cascadeRatingMultiplier?: number;
      referralPercent?: number;
      referralCurrency?: string;
      merchantName?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    if (role === UserRole.PAYOUT_TRADER) {
      if (!opts?.countryId) {
        throw new BadRequestException('countryId is required for Pay-Out specialist users');
      }
      const country = await this.prisma.country.findUnique({ where: { id: opts.countryId } });
      if (!country) {
        throw new NotFoundException('Country not found');
      }
    }

    if (role === UserRole.MERCHANT) {
      const name = opts?.merchantName?.trim();
      if (!name) {
        throw new BadRequestException('merchantName is required when role is MERCHANT');
      }
    }

    if (role === UserRole.TRADER) {
      const minL = opts?.payoutMinLimit ?? 0;
      const maxL = opts?.payoutMaxLimit ?? 0;
      if (minL < 0 || maxL < 0) {
        throw new BadRequestException('Payout pool limits must be non-negative (0 means no limit)');
      }
      if (maxL > 0 && minL > maxL) {
        throw new BadRequestException('payoutMinLimit cannot be greater than payoutMaxLimit');
      }
    }

    let referralCurrencyId: string | undefined;
    if (role === UserRole.REFERRAL) {
      const code = (opts?.referralCurrency ?? 'UAH').trim() || 'UAH';
      referralCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(code);
    }

    const passwordHash = await hashPassword(password);

    try {
      const user = await this.prisma.$transaction(async (tx) =>
        tx.user.create({
          data: {
            email,
            passwordHash,
            role,
            ...(role === UserRole.TRADER
              ? {
                  traderProfile: {
                    create: {
                      overdraftLimit: opts?.overdraftLimitUsdt ?? 0,
                      payinRate: opts?.payinRate ?? 0,
                      payoutRate: opts?.traderPayoutRate ?? 0,
                      payoutMinLimit: opts?.payoutMinLimit ?? 0,
                      payoutMaxLimit: opts?.payoutMaxLimit ?? 0,
                      processingMethod: opts?.processingMethod ?? TraderProcessingMethod.CARD,
                      cascadeRatingMultiplier:
                        opts?.cascadeRatingMultiplier !== undefined
                          ? opts.cascadeRatingMultiplier
                          : 1,
                    },
                  },
                }
              : {}),
            ...(role === UserRole.PAYOUT_TRADER
              ? {
                  payoutTraderProfile: {
                    create: {
                      countryId: opts!.countryId!,
                      payoutRate: opts?.payoutRate ?? 0,
                    },
                  },
                }
              : {}),
            ...(role === UserRole.REFERRAL
              ? {
                  referralProfile: {
                    create: {
                      referralPercent: opts?.referralPercent ?? 0,
                      currencyId: referralCurrencyId!,
                    },
                  },
                }
              : {}),
            ...(role === UserRole.MERCHANT
              ? {
                  merchant: {
                    create: { name: opts!.merchantName!.trim() },
                  },
                }
              : {}),
          },
          select: USER_SELECT,
        }),
      );

      this.logger.log(`User ${email} created with role ${role}`);

      if (role === UserRole.TRADER) {
        const profile = await this.prisma.traderProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (profile) {
          void this.traderWallets.ensureProvisioned(profile.id);
        }
        this.tradersService.invalidateCascadeCoverageCaches();
      }

      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const targets = e.meta?.target;
        const targetStr = Array.isArray(targets) ? targets.join(',') : String(targets ?? '');
        if (targetStr.includes('name')) {
          throw new ConflictException('Merchant display name is already in use');
        }
      }
      throw e;
    }
  }

  async update(
    id: string,
    data: { email?: string; isActive?: boolean; merchantName?: string },
  ) {
    const existing = await this.findById(id);
    if (data.isActive === false && existing.role === UserRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be deactivated');
    }

    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData as any,
      select: USER_SELECT,
    });

    if (updated.role === UserRole.TRADER) {
      const profile = await this.prisma.traderProfile.upsert({
        where: { userId: id },
        create: { userId: id },
        update: {},
        select: { id: true },
      });
      void this.traderWallets.ensureProvisioned(profile.id);
    }

    if (updated.role === UserRole.REFERRAL) {
      const uahId = await this.currencies.requireActiveCurrencyIdByCode('UAH');
      await this.prisma.referralProfile.upsert({
        where: { userId: id },
        create: { userId: id, referralPercent: 0, currencyId: uahId },
        update: {},
      });
    }

    if (updated.role === UserRole.MERCHANT) {
      const emailLocal = updated.email.split('@')[0] || 'Merchant';
      const merchantName = data.merchantName?.trim() || emailLocal;
      try {
        await this.prisma.merchant.upsert({
          where: { userId: id },
          create: { userId: id, name: merchantName },
          update: data.merchantName?.trim() ? { name: data.merchantName.trim() } : {},
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Merchant display name is already in use');
        }
        throw e;
      }
    }

    if (data.isActive === false && existing.isActive) {
      await this.applyUserDeactivationSideEffects(id, updated.role as UserRole, existing.isActive);
    } else {
      await this.syncMerchantLockWithLinkedUser(
        id,
        updated.role as UserRole,
        updated.isActive,
        existing.isActive,
      );
    }

    this.logger.log(`User ${id} updated`);
    return updated;
  }

  private async collectPermanentDeleteBlockers(userId: string): Promise<string[]> {
    const blockers: string[] = [];

    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (merchant) {
      const [payinCount, payoutCount, settlementCount] = await Promise.all([
        this.prisma.payinOrder.count({ where: { merchantId: merchant.id } }),
        this.prisma.payoutOrder.count({ where: { merchantId: merchant.id } }),
        this.prisma.settlement.count({ where: { merchantId: merchant.id } }),
      ]);
      if (payinCount > 0) {
        blockers.push(`${payinCount} Pay-In order(s) linked to this merchant`);
      }
      if (payoutCount > 0) {
        blockers.push(`${payoutCount} Pay-Out order(s) linked to this merchant`);
      }
      if (settlementCount > 0) {
        blockers.push(`${settlementCount} settlement(s) linked to this merchant`);
      }
    }

    const traderProfile = await this.prisma.traderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (traderProfile) {
      const [payinCount, payoutCount, settlementCount] = await Promise.all([
        this.prisma.payinOrder.count({ where: { traderId: traderProfile.id } }),
        this.prisma.payoutOrder.count({ where: { traderId: traderProfile.id } }),
        this.prisma.settlement.count({ where: { traderId: traderProfile.id } }),
      ]);
      if (payinCount > 0) {
        blockers.push(`${payinCount} Pay-In order(s) assigned to this trader`);
      }
      if (payoutCount > 0) {
        blockers.push(`${payoutCount} Pay-Out order(s) assigned to this trader`);
      }
      if (settlementCount > 0) {
        blockers.push(`${settlementCount} settlement(s) linked to this trader`);
      }
    }

    const payoutTraderProfile = await this.prisma.payoutTraderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (payoutTraderProfile) {
      const [payoutCount, settlementCount] = await Promise.all([
        this.prisma.payoutOrder.count({ where: { payoutTraderId: payoutTraderProfile.id } }),
        this.prisma.settlement.count({ where: { payoutTraderId: payoutTraderProfile.id } }),
      ]);
      if (payoutCount > 0) {
        blockers.push(`${payoutCount} Pay-Out order(s) assigned to this specialist`);
      }
      if (settlementCount > 0) {
        blockers.push(`${settlementCount} settlement(s) linked to this specialist`);
      }
    }

    const referralProfile = await this.prisma.referralProfile.findUnique({
      where: { userId },
      select: { id: true, balance: true },
    });
    if (referralProfile) {
      if (Number(referralProfile.balance) !== 0) {
        blockers.push('Referral balance is not zero');
      }
    }

    return blockers;
  }

  /**
   * Hard-delete an inactive cabinet account. Owner-only. Blocked when orders or settlements still reference the profile.
   */
  async purge(id: string) {
    const existing = await this.findById(id);
    if (existing.role === UserRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be permanently deleted');
    }
    if (existing.isActive) {
      throw new ConflictException('Deactivate the cabinet before permanent deletion');
    }

    const blockers = await this.collectPermanentDeleteBlockers(id);
    if (blockers.length > 0) {
      throw new ConflictException(
        `Cabinet cannot be permanently deleted: ${blockers.join('; ')}`,
      );
    }

    const referralProfile = await this.prisma.referralProfile.findUnique({
      where: { userId: id },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (referralProfile) {
        await tx.user.updateMany({
          where: { referredById: referralProfile.id },
          data: { referredById: null },
        });
      }

      await tx.auditLog.updateMany({
        where: { actorId: id },
        data: { actorId: null },
      });
      await tx.file.updateMany({
        where: { uploadedBy: id },
        data: { uploadedBy: null },
      });
      await tx.balanceTransaction.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      });
      await tx.settlement.updateMany({
        where: { adminId: id },
        data: { adminId: null },
      });

      await tx.user.delete({ where: { id } });
    });

    this.logger.warn(`User ${id} permanently deleted`);
    return { id, deleted: true };
  }

  async deactivate(id: string) {
    const existing = await this.findById(id);
    if (existing.role === UserRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be deactivated');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    if (existing.isActive) {
      await this.applyUserDeactivationSideEffects(id, user.role as UserRole, existing.isActive);
    }

    this.logger.log(`User ${id} deactivated`);
    return user;
  }
}

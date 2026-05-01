import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@p2p/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { hashPassword } from '../../common/utils/password';
import { TraderWalletsService } from '../trader-wallets/trader-wallets.service';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';

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
} as const;

type UserListWithInclude = Prisma.UserGetPayload<{ include: typeof USER_LIST_INCLUDE }>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly traderWallets: TraderWalletsService,
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
      data: rows.map((u) => this.mapDirectoryUserRow(u)),
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

    const passwordHash = await hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        ...(role === UserRole.TRADER ? { traderProfile: { create: {} } } : {}),
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
                  currency: (opts?.referralCurrency ?? 'UAH').trim() || 'UAH',
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
    });

    this.logger.log(`User ${email} created with role ${role}`);

    if (role === UserRole.TRADER) {
      const profile = await this.prisma.traderProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (profile) {
        void this.traderWallets.ensureProvisioned(profile.id);
      }
    }

    return user;
  }

  async update(
    id: string,
    data: { email?: string; role?: UserRole; isActive?: boolean; merchantName?: string },
  ) {
    const existing = await this.findById(id);
    if (data.isActive === false && existing.role === UserRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be deactivated');
    }

    if (data.role === UserRole.MERCHANT) {
      const hasMerchant = await this.prisma.merchant.findUnique({ where: { userId: id } });
      if (!hasMerchant && !data.merchantName?.trim()) {
        throw new BadRequestException(
          'merchantName is required when assigning role MERCHANT without an existing merchant profile',
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
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
      await this.prisma.referralProfile.upsert({
        where: { userId: id },
        create: { userId: id, referralPercent: 0, currency: 'UAH' },
        update: {},
      });
    }

    if (updated.role === UserRole.MERCHANT) {
      const emailLocal = updated.email.split('@')[0] || 'Merchant';
      const merchantName = data.merchantName?.trim() || emailLocal;
      await this.prisma.merchant.upsert({
        where: { userId: id },
        create: { userId: id, name: merchantName },
        update: data.merchantName?.trim() ? { name: data.merchantName.trim() } : {},
      });
    }

    this.logger.log(`User ${id} updated`);
    return updated;
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

    this.logger.log(`User ${id} deactivated`);
    return user;
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { hashPassword } from '../../common/utils/password';
import { CreateReferralDto, UpdateReferralDto } from './dto';
import { CurrenciesService } from '../currencies/currencies.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

  // ─── Admin: list all referral agents ───

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [profiles, total] = await Promise.all([
      this.prisma.referralProfile.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, isActive: true, createdAt: true } },
          currency: { select: { code: true } },
          referrals: {
            select: { id: true, email: true, role: true, isActive: true, createdAt: true },
          },
        },
      }),
      this.prisma.referralProfile.count(),
    ]);

    return { data: profiles, total, page, limit };
  }

  // ─── Admin: get one referral agent with full stats ───

  async findById(profileId: string) {
    const profile = await this.prisma.referralProfile.findUnique({
      where: { id: profileId },
      include: {
        user: { select: { id: true, email: true, isActive: true, createdAt: true } },
        currency: { select: { code: true } },
        referrals: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            traderProfile: {
              select: {
                id: true,
                isActive: true,
                balances: { include: { currency: { select: { code: true } } } },
                payoutMinLimit: true,
                payoutMaxLimit: true,
              },
            },
            merchant: {
              select: {
                id: true,
                name: true,
                isLock: true,
                balances: { include: { currency: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });

    if (!profile) throw new NotFoundException('Referral profile not found');
    return profile;
  }

  // ─── Admin: get referral by userId ───

  async findByUserId(userId: string) {
    const profile = await this.prisma.referralProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        currency: { select: { code: true } },
        referrals: {
          select: { id: true, email: true, role: true, isActive: true },
        },
      },
    });

    if (!profile) throw new NotFoundException('Referral profile not found for this user');
    return profile;
  }

  // ─── Admin: create a new referral user + profile ───

  async create(dto: CreateReferralDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(dto.password);
    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(
      (dto.currency ?? 'UAH').trim() || 'UAH',
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, role: 'REFERRAL' },
      });

      const profile = await tx.referralProfile.create({
        data: {
          userId: user.id,
          referralPercent: dto.referralPercent ?? 0,
          currencyId,
        },
        include: {
          user: { select: { id: true, email: true, isActive: true } },
        },
      });

      return profile;
    });

    this.logger.log(`Referral agent created: ${dto.email}`);
    return result;
  }

  // ─── Admin: update referral profile (percent, currency) ───

  async update(profileId: string, dto: UpdateReferralDto) {
    await this.findById(profileId);

    const data: Prisma.ReferralProfileUpdateInput = {};
    if (dto.referralPercent !== undefined) data.referralPercent = dto.referralPercent;
    if (dto.currency !== undefined) {
      const cid = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);
      data.currency = { connect: { id: cid } };
    }

    const updated = await this.prisma.referralProfile.update({
      where: { id: profileId },
      data,
      include: {
        user: { select: { id: true, email: true, isActive: true } },
      },
    });

    this.logger.log(`Referral profile ${profileId} updated`);
    return updated;
  }

  // ─── Admin: link an existing user to a referral agent ───

  async linkUser(referralProfileId: string, userId: string) {
    await this.findById(referralProfileId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.referredById) {
      throw new ConflictException('User is already linked to a referral agent');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { referredById: referralProfileId },
      select: { id: true, email: true, role: true, referredById: true },
    });

    this.logger.log(`User ${userId} linked to referral profile ${referralProfileId}`);
    return updated;
  }

  // ─── Admin: unlink a user from a referral agent ───

  async unlinkUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.referredById) throw new BadRequestException('User is not linked to any referral agent');

    return this.prisma.user.update({
      where: { id: userId },
      data: { referredById: null },
      select: { id: true, email: true, role: true, referredById: true },
    });
  }

  // ─── Referral cabinet: get own profile ───

  async getMyProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // ─── Referral cabinet: get statistics of referred users ───

  async getMyStatistics(userId: string) {
    const profile = await this.findByUserId(userId);

    const referredIds = profile.referrals.map((u) => u.id);

    if (referredIds.length === 0) {
      return {
        referralProfileId: profile.id,
        referralPercent: Number(profile.referralPercent),
        balance: Number(profile.balance),
        currency: profile.currency.code,
        totalReferred: 0,
        traders: [],
        merchants: [],
      };
    }

    // Fetch extended data for all referred users
    const referredUsers = await this.prisma.user.findMany({
      where: { id: { in: referredIds } },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        traderProfile: {
          select: {
            id: true,
            isActive: true,
            balances: { include: { currency: { select: { code: true } } } },
            payinOrders: {
              where: { status: 'PAID' },
              select: { amount: true, commission: true },
            },
            payoutOrders: {
              where: { status: 'COMPLETED' },
              select: { amount: true, percentFee: true },
            },
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
            isLock: true,
            balances: { include: { currency: { select: { code: true } } } },
          },
        },
      },
    });

    const traders = referredUsers
      .filter((u) => u.traderProfile)
      .map((u) => ({
        userId: u.id,
        email: u.email,
        isActive: u.isActive,
        traderId: u.traderProfile!.id,
        traderActive: u.traderProfile!.isActive,
        balances: u.traderProfile!.balances.map((b) => ({
          currency: b.currency.code,
          amount: Number(b.amount),
        })),
        completedPayins: u.traderProfile!.payinOrders.length,
        totalPayinAmount: u.traderProfile!.payinOrders.reduce(
          (sum, o) => sum + Number(o.amount),
          0,
        ),
        completedPayouts: u.traderProfile!.payoutOrders.length,
        totalPayoutAmount: u.traderProfile!.payoutOrders.reduce(
          (sum, o) => sum + Number(o.amount),
          0,
        ),
      }));

    const merchants = referredUsers
      .filter((u) => u.merchant)
      .map((u) => ({
        userId: u.id,
        email: u.email,
        isActive: u.isActive,
        merchantId: u.merchant!.id,
        merchantName: u.merchant!.name,
        isLock: u.merchant!.isLock,
        balances: u.merchant!.balances.map((b) => ({
          currency: b.currency.code,
          amount: Number(b.amount),
        })),
      }));

    return {
      referralProfileId: profile.id,
      referralPercent: Number(profile.referralPercent),
      balance: Number(profile.balance),
      currency: profile.currency.code,
      totalReferred: referredIds.length,
      traders,
      merchants,
    };
  }
}

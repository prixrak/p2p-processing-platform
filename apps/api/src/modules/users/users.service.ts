import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { hashPassword } from '../../common/utils/password';
import { TraderWalletsService } from '../trader-wallets/trader-wallets.service';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly traderWallets: TraderWalletsService,
  ) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: USER_SELECT,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return { data: users, total, page, limit };
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
    opts?: { countryId?: string; payoutRate?: number },
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
    data: { email?: string; role?: UserRole; isActive?: boolean },
  ) {
    await this.findById(id);

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

    this.logger.log(`User ${id} updated`);
    return updated;
  }

  async deactivate(id: string) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    this.logger.log(`User ${id} deactivated`);
    return user;
  }
}

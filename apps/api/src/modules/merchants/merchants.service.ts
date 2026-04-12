import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateMerchantDto, UpdateMerchantDto } from './dto';
import { DirectionType } from '@p2p/shared';
import { ApiKeyDirection } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMerchantDto) {
    const existing = await this.prisma.merchant.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException('Merchant already exists for this user');
    }

    const merchant = await this.prisma.merchant.create({
      data: {
        userId: dto.userId,
        name: dto.name,
      },
      include: { user: { select: { email: true, role: true } } },
    });

    this.logger.log(`Merchant created: ${merchant.id} for user ${dto.userId}`);
    return merchant;
  }

  async findById(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        balances: true,
        apiKeys: { where: { isActive: true } },
        user: { select: { email: true, role: true, isActive: true } },
      },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return merchant;
  }

  async findByUserId(userId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
      include: {
        balances: true,
        apiKeys: { where: { isActive: true } },
      },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant for user ${userId} not found`);
    }
    return merchant;
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        skip,
        take: limit,
        include: {
          balances: true,
          user: { select: { email: true, role: true, isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count(),
    ]);

    return { data: merchants, total, page, limit };
  }

  async update(id: string, dto: UpdateMerchantDto) {
    await this.findById(id);

    return this.prisma.merchant.update({
      where: { id },
      data: dto,
      include: { balances: true },
    });
  }

  async lock(id: string) {
    const merchant = await this.findById(id);
    if (merchant.isLock) {
      throw new ConflictException('Merchant is already locked');
    }

    this.logger.warn(`Merchant locked: ${id}`);
    return this.prisma.merchant.update({
      where: { id },
      data: { isLock: true },
    });
  }

  async unlock(id: string) {
    const merchant = await this.findById(id);
    if (!merchant.isLock) {
      throw new ConflictException('Merchant is not locked');
    }

    this.logger.log(`Merchant unlocked: ${id}`);
    return this.prisma.merchant.update({
      where: { id },
      data: { isLock: false },
    });
  }

  async generateApiKeys(merchantId: string, direction: DirectionType) {
    await this.findById(merchantId);

    const prismaDirection =
      direction === DirectionType.PAYIN
        ? ApiKeyDirection.PAYIN
        : ApiKeyDirection.PAYOUT;

    await this.prisma.merchantApiKey.updateMany({
      where: { merchantId, direction: prismaDirection, isActive: true },
      data: { isActive: false },
    });

    const publicKey = `pk_${direction.toLowerCase()}_${crypto.randomBytes(24).toString('hex')}`;
    const secretKey = `sk_${direction.toLowerCase()}_${crypto.randomBytes(32).toString('hex')}`;
    const secretKeyHash = crypto
      .createHash('sha256')
      .update(secretKey)
      .digest('hex');

    const apiKey = await this.prisma.merchantApiKey.create({
      data: {
        merchantId,
        direction: prismaDirection,
        publicKey,
        secretKeyHash,
      },
    });

    this.logger.log(
      `API keys generated for merchant ${merchantId}, direction ${direction}`,
    );

    return {
      id: apiKey.id,
      publicKey,
      secretKey,
      direction,
    };
  }

  async regenerateApiKey(keyId: string) {
    const existing = await this.prisma.merchantApiKey.findUnique({
      where: { id: keyId },
    });
    if (!existing) {
      throw new NotFoundException(`API key ${keyId} not found`);
    }

    await this.prisma.merchantApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    const direction = existing.direction === ApiKeyDirection.PAYIN ? 'payin' : 'payout';
    const publicKey = `pk_${direction}_${crypto.randomBytes(24).toString('hex')}`;
    const secretKey = `sk_${direction}_${crypto.randomBytes(32).toString('hex')}`;
    const secretKeyHash = crypto
      .createHash('sha256')
      .update(secretKey)
      .digest('hex');

    const newKey = await this.prisma.merchantApiKey.create({
      data: {
        merchantId: existing.merchantId,
        direction: existing.direction,
        publicKey,
        secretKeyHash,
      },
    });

    this.logger.log(`API key regenerated: old=${keyId}, new=${newKey.id}`);

    return {
      id: newKey.id,
      publicKey,
      secretKey,
      direction: existing.direction,
    };
  }

  async getBalances(merchantId: string) {
    await this.findById(merchantId);

    return this.prisma.merchantBalance.findMany({
      where: { merchantId },
    });
  }
}

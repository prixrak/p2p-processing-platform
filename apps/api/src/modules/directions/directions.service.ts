import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto';
import { DirectionType } from '@p2p/shared';

@Injectable()
export class DirectionsService {
  private readonly logger = new Logger(DirectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * New directions must reference currencies that exist in `currencies` and are active.
   * On update, only newly chosen codes are validated so legacy directions can be edited
   * if their stored codes were later deactivated.
   */
  private async assertSingleActiveCurrency(code: string) {
    const c = code.trim().toUpperCase();
    if (!c) {
      throw new BadRequestException('Currency code is required');
    }
    const row = await this.prisma.currency.findUnique({ where: { code: c } });
    if (!row) {
      throw new BadRequestException(
        `Unknown currency code: ${c}. Add it in Currencies first.`,
      );
    }
    if (!row.isActive) {
      throw new BadRequestException(
        `Inactive currency: ${c}. Activate the currency or pick another.`,
      );
    }
  }

  async create(dto: CreateDirectionDto) {
    const fromCurrency = dto.fromCurrency.trim().toUpperCase();
    const toCurrency = dto.toCurrency.trim().toUpperCase();
    await this.assertSingleActiveCurrency(fromCurrency);
    await this.assertSingleActiveCurrency(toCurrency);

    const direction = await this.prisma.direction.create({
      data: {
        name: dto.name,
        type: dto.type,
        fromCurrency,
        toCurrency,
        minAmount: dto.minAmount ?? 0,
        maxAmount: dto.maxAmount ?? 0,
        rate: dto.rate ?? 1,
        percentFee: dto.percentFee ?? 0,
        isOnline: dto.isOnline ?? true,
      },
    });

    this.logger.log(
      `Direction created: ${direction.id} — ${direction.name} (${direction.type})`,
    );
    return direction;
  }

  async update(id: string, dto: UpdateDirectionDto) {
    const existing = await this.findById(id);

    const fromCurrency =
      dto.fromCurrency !== undefined
        ? dto.fromCurrency.trim().toUpperCase()
        : existing.fromCurrency;
    const toCurrency =
      dto.toCurrency !== undefined
        ? dto.toCurrency.trim().toUpperCase()
        : existing.toCurrency;

    if (
      dto.fromCurrency !== undefined &&
      fromCurrency !== existing.fromCurrency
    ) {
      await this.assertSingleActiveCurrency(fromCurrency);
    }
    if (
      dto.toCurrency !== undefined &&
      toCurrency !== existing.toCurrency
    ) {
      await this.assertSingleActiveCurrency(toCurrency);
    }

    const { fromCurrency: _fc, toCurrency: _tc, ...rest } = dto;
    return this.prisma.direction.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.fromCurrency !== undefined ? { fromCurrency } : {}),
        ...(dto.toCurrency !== undefined ? { toCurrency } : {}),
      },
    });
  }

  async findAll() {
    return this.prisma.direction.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const direction = await this.prisma.direction.findUnique({
      where: { id },
    });
    if (!direction) {
      throw new NotFoundException(`Direction ${id} not found`);
    }
    return direction;
  }

  async findByType(type: DirectionType) {
    return this.prisma.direction.findMany({
      where: { type },
      orderBy: { name: 'asc' },
    });
  }

  async toggleOnline(id: string) {
    const direction = await this.findById(id);

    const updated = await this.prisma.direction.update({
      where: { id },
      data: { isOnline: !direction.isOnline },
    });

    this.logger.log(
      `Direction ${id} toggled: isOnline=${updated.isOnline}`,
    );
    return updated;
  }

  async setOnline(id: string) {
    const direction = await this.findById(id);
    if (direction.isOnline) {
      throw new ConflictException('Direction is already online');
    }

    this.logger.log(`Direction set online: ${id}`);
    return this.prisma.direction.update({
      where: { id },
      data: { isOnline: true },
    });
  }

  async setOffline(id: string) {
    const direction = await this.findById(id);
    if (!direction.isOnline) {
      throw new ConflictException('Direction is already offline');
    }

    this.logger.warn(`Direction set offline: ${id}`);
    return this.prisma.direction.update({
      where: { id },
      data: { isOnline: false },
    });
  }
}

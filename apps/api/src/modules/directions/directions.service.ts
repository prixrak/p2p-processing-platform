import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto';
import { DirectionType } from '@p2p/shared';
import type { Currency, Direction } from '@prisma/client';

type DirectionWithCurrencies = Direction & { fromCurrency: Currency; toCurrency: Currency };

@Injectable()
export class DirectionsService {
  private readonly logger = new Logger(DirectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

  /** Flatten currency relations to code strings for API compatibility. */
  private toApiDirection(row: DirectionWithCurrencies) {
    const { fromCurrency, toCurrency, ...rest } = row;
    return {
      ...rest,
      fromCurrency: fromCurrency.code,
      toCurrency: toCurrency.code,
    };
  }

  async create(dto: CreateDirectionDto) {
    const fromCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.fromCurrency);
    const toCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.toCurrency);

    const direction = await this.prisma.direction.create({
      data: {
        name: dto.name,
        type: dto.type,
        fromCurrencyId,
        toCurrencyId,
        minAmount: dto.minAmount ?? 0,
        maxAmount: dto.maxAmount ?? 0,
        percentFee: dto.percentFee ?? 0,
        isOnline: dto.isOnline ?? true,
      },
      include: { fromCurrency: true, toCurrency: true },
    });

    this.logger.log(`Direction created: ${direction.id} — ${direction.name} (${direction.type})`);
    return this.toApiDirection(direction);
  }

  async update(id: string, dto: UpdateDirectionDto) {
    const existing = await this.prisma.direction.findUnique({
      where: { id },
      include: { fromCurrency: true, toCurrency: true },
    });
    if (!existing) {
      throw new NotFoundException(`Direction ${id} not found`);
    }

    let fromCurrencyId = existing.fromCurrencyId;
    let toCurrencyId = existing.toCurrencyId;

    if (dto.fromCurrency !== undefined) {
      const next = this.currencies.normalizeCode(dto.fromCurrency);
      if (next !== existing.fromCurrency.code) {
        fromCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.fromCurrency);
      }
    }
    if (dto.toCurrency !== undefined) {
      const next = this.currencies.normalizeCode(dto.toCurrency);
      if (next !== existing.toCurrency.code) {
        toCurrencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.toCurrency);
      }
    }

    const { fromCurrency: _fc, toCurrency: _tc, ...rest } = dto;
    const updated = await this.prisma.direction.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.fromCurrency !== undefined ? { fromCurrencyId } : {}),
        ...(dto.toCurrency !== undefined ? { toCurrencyId } : {}),
      },
      include: { fromCurrency: true, toCurrency: true },
    });
    return this.toApiDirection(updated);
  }

  async findAll() {
    const rows = await this.prisma.direction.findMany({
      include: { fromCurrency: true, toCurrency: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toApiDirection(r));
  }

  async findById(id: string) {
    const direction = await this.prisma.direction.findUnique({
      where: { id },
      include: { fromCurrency: true, toCurrency: true },
    });
    if (!direction) {
      throw new NotFoundException(`Direction ${id} not found`);
    }
    return this.toApiDirection(direction);
  }

  async findByType(type: DirectionType) {
    const rows = await this.prisma.direction.findMany({
      where: { type },
      include: { fromCurrency: true, toCurrency: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toApiDirection(r));
  }

  async toggleOnline(id: string) {
    const direction = await this.prisma.direction.findUniqueOrThrow({
      where: { id },
      include: { fromCurrency: true, toCurrency: true },
    });

    const updated = await this.prisma.direction.update({
      where: { id },
      data: { isOnline: !direction.isOnline },
      include: { fromCurrency: true, toCurrency: true },
    });

    this.logger.log(`Direction ${id} toggled: isOnline=${updated.isOnline}`);
    return this.toApiDirection(updated);
  }

  async setOnline(id: string) {
    const direction = await this.prisma.direction.findUniqueOrThrow({
      where: { id },
      include: { fromCurrency: true, toCurrency: true },
    });
    if (direction.isOnline) {
      throw new ConflictException('Direction is already online');
    }

    this.logger.log(`Direction set online: ${id}`);
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { isOnline: true },
      include: { fromCurrency: true, toCurrency: true },
    });
    return this.toApiDirection(updated);
  }

  async setOffline(id: string) {
    const direction = await this.prisma.direction.findUniqueOrThrow({
      where: { id },
      include: { fromCurrency: true, toCurrency: true },
    });
    if (!direction.isOnline) {
      throw new ConflictException('Direction is already offline');
    }

    this.logger.warn(`Direction set offline: ${id}`);
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { isOnline: false },
      include: { fromCurrency: true, toCurrency: true },
    });
    return this.toApiDirection(updated);
  }
}

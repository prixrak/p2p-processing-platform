import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';

@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);
  private usdtIdMemo: Promise<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /** Resolves code to id when the row exists (any active flag). */
  async findCurrencyIdByCode(code: string): Promise<string | null> {
    const c = this.normalizeCode(code);
    if (!c) return null;
    const row = await this.prisma.currency.findUnique({ where: { code: c } });
    return row?.id ?? null;
  }

  /** Resolves an active currency code to id; throws if missing or inactive. */
  async requireActiveCurrencyIdByCode(code: string): Promise<string> {
    const c = this.normalizeCode(code);
    if (!c) {
      throw new BadRequestException('Currency code is required');
    }
    const row = await this.prisma.currency.findUnique({ where: { code: c } });
    if (!row) {
      throw new BadRequestException(`Unknown currency: ${c}. Add it in Currencies first.`);
    }
    if (!row.isActive) {
      throw new BadRequestException(`Inactive currency: ${c}.`);
    }
    return row.id;
  }

  /** USDT row id (cached). Throws if USDT is missing from reference data. */
  async getUsdtCurrencyId(): Promise<string> {
    if (!this.usdtIdMemo) {
      this.usdtIdMemo = this.prisma.currency
        .findUniqueOrThrow({ where: { code: 'USDT' } })
        .then((r) => r.id);
    }
    return this.usdtIdMemo;
  }

  async findAll() {
    return this.prisma.currency.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: CreateCurrencyDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.currency.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(`Currency ${code} already exists`);
    }

    const row = await this.prisma.currency.create({
      data: { code, isActive: true },
    });
    this.logger.log(`Currency created: ${code}`);
    return row;
  }

  async update(id: string, dto: UpdateCurrencyDto) {
    await this.findById(id);

    const row = await this.prisma.currency.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    this.logger.log(`Currency ${id} updated`);
    return row;
  }

  async findById(id: string) {
    const row = await this.prisma.currency.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Currency not found');
    }
    return row;
  }
}

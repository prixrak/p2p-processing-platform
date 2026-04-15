import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';

@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);

  constructor(private readonly prisma: PrismaService) {}

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

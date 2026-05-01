import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PaymentBankApiDto } from '@p2p/shared';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(currency?: string): Promise<PaymentBankApiDto[]> {
    const banks = await this.prisma.bank.findMany({
      where: {
        isActive: true,
        ...(currency
          ? {
              requisites: {
                some: {
                  isActive: true,
                  currency: { code: currency.trim().toUpperCase() },
                },
              },
            }
          : {}),
      },
    });

    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      logo_id: b.logoFileId ?? '',
    }));
  }

  async findAllAdmin() {
    return this.prisma.bank.findMany({
      include: { _count: { select: { requisites: true } } },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id: number) {
    const bank = await this.prisma.bank.findUnique({
      where: { id },
      include: { logoFile: true },
    });
    if (!bank) throw new NotFoundException('Bank not found');
    return bank;
  }

  async create(dto: CreateBankDto) {
    return this.prisma.bank.create({
      data: {
        name: dto.name,
        logoFileId: dto.logoFileId,
      },
    });
  }

  async update(id: number, dto: UpdateBankDto) {
    await this.findById(id);
    return this.prisma.bank.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.logoFileId !== undefined ? { logoFileId: dto.logoFileId } : {}),
      },
    });
  }

  async activate(id: number) {
    await this.findById(id);
    return this.prisma.bank.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivate(id: number) {
    await this.findById(id);
    return this.prisma.bank.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

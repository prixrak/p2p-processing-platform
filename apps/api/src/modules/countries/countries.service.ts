import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../config/prisma.service';
import { CurrenciesService } from '../currencies/currencies.service';

export class CreateCountryDto {
  @ApiProperty({ example: 'Ukraine' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'UA' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'UAH' })
  @IsString()
  currency!: string;
}

export class UpdateCountryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

  async findAll(activeOnly = false) {
    return this.prisma.country.findMany({
      where: activeOnly ? { isActive: true } : {},
      include: {
        _count: { select: { paymentMethods: true } },
        currency: { select: { id: true, code: true, isActive: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.country.findUnique({
      where: { id },
      include: {
        paymentMethods: { orderBy: { name: 'asc' } },
        currency: { select: { id: true, code: true, isActive: true } },
      },
    });
    if (!row) throw new NotFoundException(`Country ${id} not found`);
    return row;
  }

  async create(dto: CreateCountryDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.country.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Country code ${code} already exists`);

    const currencyId = await this.currencies.requireActiveCurrencyIdByCode(dto.currency);

    const row = await this.prisma.country.create({
      data: { name: dto.name.trim(), code, currencyId },
    });
    this.logger.log(`Country created: ${code}`);
    return row;
  }

  async update(id: string, dto: UpdateCountryDto) {
    await this.findById(id);
    const row = await this.prisma.country.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    this.logger.log(`Country ${id} updated`);
    return row;
  }
}

import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { IsString, IsEnum, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethodFlowType,
  PaymentMethodRequisiteType,
  PaymentMethodAvailability,
} from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

export class CreatePaymentMethodDto {
  @ApiProperty()
  @IsUUID()
  countryId!: string;

  @ApiProperty({ example: 'CARD_P2P' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'P2P card' })
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: PaymentMethodFlowType })
  @IsEnum(PaymentMethodFlowType)
  flowType!: PaymentMethodFlowType;

  @ApiProperty({ enum: PaymentMethodRequisiteType })
  @IsEnum(PaymentMethodRequisiteType)
  requisiteType!: PaymentMethodRequisiteType;

  @ApiProperty({ enum: PaymentMethodAvailability })
  @IsEnum(PaymentMethodAvailability)
  availability!: PaymentMethodAvailability;
}

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: PaymentMethodAvailability })
  @IsOptional()
  @IsEnum(PaymentMethodAvailability)
  availability?: PaymentMethodAvailability;
}

@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(countryId?: string, activeOnly = false) {
    return this.prisma.paymentMethod.findMany({
      where: {
        ...(countryId ? { countryId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        country: { include: { currency: { select: { code: true } } } },
      },
      orderBy: [{ countryId: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const row = await this.prisma.paymentMethod.findUnique({
      where: { id },
      include: { country: { include: { currency: { select: { code: true } } } } },
    });
    if (!row) throw new NotFoundException(`PaymentMethod ${id} not found`);
    return row;
  }

  async create(dto: CreatePaymentMethodDto) {
    const existing = await this.prisma.paymentMethod.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`PaymentMethod ${dto.name} already exists`);

    const row = await this.prisma.paymentMethod.create({
      data: {
        countryId: dto.countryId,
        name: dto.name.trim().toUpperCase(),
        displayName: dto.displayName.trim(),
        flowType: dto.flowType,
        requisiteType: dto.requisiteType,
        availability: dto.availability,
      },
      include: { country: { include: { currency: { select: { code: true } } } } },
    });
    this.logger.log(`PaymentMethod created: ${dto.name}`);
    return row;
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    await this.findById(id);
    const row = await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.availability !== undefined ? { availability: dto.availability } : {}),
      },
      include: { country: { include: { currency: { select: { code: true } } } } },
    });
    this.logger.log(`PaymentMethod ${id} updated`);
    return row;
  }
}

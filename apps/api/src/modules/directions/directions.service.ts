import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto';
import { DirectionType } from '@p2p/shared';

@Injectable()
export class DirectionsService {
  private readonly logger = new Logger(DirectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDirectionDto) {
    const direction = await this.prisma.direction.create({
      data: {
        name: dto.name,
        type: dto.type,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
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
    await this.findById(id);

    return this.prisma.direction.update({
      where: { id },
      data: dto,
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

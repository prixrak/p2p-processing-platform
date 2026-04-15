import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@p2p/shared';
import { PrismaService } from '../../config/prisma.service';
import { IsString } from 'class-validator';

class UpdateOrderStatusDto {
  @IsString()
  status: string;
}

@ApiTags('Admin Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders (payin or payout) with filters' })
  @ApiQuery({ name: 'type', required: false, enum: ['PAYIN', 'PAYOUT'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'merchant', required: false })
  @ApiQuery({ name: 'trader', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('type') type?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('merchant') merchantFilter?: string,
    @Query('trader') traderFilter?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const orderType = type ?? direction;
    const isPayin = !orderType || orderType.toUpperCase() === 'PAYIN' || orderType === 'PAY_IN';

    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    if (isPayin) {
      const where: Record<string, unknown> = {};
      if (status) where.status = status.toUpperCase();
      if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
      if (search) {
        where.OR = [
          { id: { contains: search, mode: 'insensitive' } },
          { requestId: { contains: search, mode: 'insensitive' } },
          { merchant: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }
      if (merchantFilter) {
        where.merchant = { name: { contains: merchantFilter, mode: 'insensitive' } };
      }
      if (traderFilter) {
        where.trader = {
          user: { email: { contains: traderFilter, mode: 'insensitive' } },
        };
      }

      const [orders, total] = await Promise.all([
        this.prisma.payinOrder.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
          },
        }),
        this.prisma.payinOrder.count({ where }),
      ]);

      return {
        data: orders.map((o) => ({
          id: o.id,
          type: 'PAYIN',
          externalId: o.requestId,
          merchantName: o.merchant.name,
          traderName: o.trader?.user?.email ?? null,
          amount: Number(o.amount),
          currency: o.currency,
          status: o.status,
          paymentMethod: null,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    } else {
      const where: Record<string, unknown> = {};
      if (status) where.status = status.toUpperCase();
      if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
      if (search) {
        where.OR = [
          { id: { contains: search, mode: 'insensitive' } },
          { requestId: { contains: search, mode: 'insensitive' } },
          { merchant: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }
      if (merchantFilter) {
        where.merchant = { name: { contains: merchantFilter, mode: 'insensitive' } };
      }
      if (traderFilter) {
        where.trader = {
          user: { email: { contains: traderFilter, mode: 'insensitive' } },
        };
      }

      const [orders, total] = await Promise.all([
        this.prisma.payoutOrder.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
          },
        }),
        this.prisma.payoutOrder.count({ where }),
      ]);

      return {
        data: orders.map((o) => ({
          id: o.id,
          type: 'PAYOUT',
          externalId: o.requestId,
          merchantName: o.merchant.name,
          traderName: o.trader?.user?.email ?? null,
          amount: Number(o.amount),
          currency: o.currency,
          status: o.status,
          paymentMethod: null,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by ID (payin or payout)' })
  @ApiQuery({ name: 'type', required: false, enum: ['PAYIN', 'PAYOUT'] })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: string,
  ) {
    const isPayin = !type || type.toUpperCase() !== 'PAYOUT';

    if (isPayin) {
      const order = await this.prisma.payinOrder.findUnique({
        where: { id },
        include: {
          merchant: { select: { name: true } },
          trader: { select: { user: { select: { email: true } } } },
          requisite: { include: { bank: { select: { name: true } } } },
        },
      });

      if (!order) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({
          where: { id },
          include: {
            merchant: { select: { name: true } },
            trader: { select: { user: { select: { email: true } } } },
          },
        });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        return this.formatPayoutDetail(payoutOrder);
      }

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      });

      return {
        id: order.id,
        type: 'PAYIN',
        externalId: order.requestId,
        merchantName: order.merchant.name,
        traderName: order.trader?.user?.email ?? null,
        amount: Number(order.amount),
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        requisites: order.requisite
          ? {
              bank: order.requisite.bank?.name ?? null,
              cardNumber: order.requisite.number,
            }
          : null,
        statusHistory: auditLogs.map((l) => ({
          status: l.action,
          timestamp: l.createdAt,
          actor: l.actor?.email ?? 'system',
        })),
      };
    } else {
      const order = await this.prisma.payoutOrder.findUnique({
        where: { id },
        include: {
          merchant: { select: { name: true } },
          trader: { select: { user: { select: { email: true } } } },
        },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      });

      return {
        ...this.formatPayoutDetail(order),
        statusHistory: auditLogs.map((l) => ({
          status: l.action,
          timestamp: l.createdAt,
          actor: l.actor?.email ?? 'system',
        })),
      };
    }
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (admin override)' })
  @ApiQuery({ name: 'type', required: false, enum: ['PAYIN', 'PAYOUT'] })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Query('type') type?: string,
  ) {
    if (!dto.status) throw new BadRequestException('status is required');
    const isPayin = !type || type.toUpperCase() !== 'PAYOUT';

    if (isPayin) {
      const order = await this.prisma.payinOrder.findUnique({ where: { id } });
      if (!order) {
        const payoutOrder = await this.prisma.payoutOrder.findUnique({ where: { id } });
        if (!payoutOrder) throw new NotFoundException(`Order ${id} not found`);
        return this.prisma.payoutOrder.update({
          where: { id },
          data: { status: dto.status as never },
        });
      }
      return this.prisma.payinOrder.update({
        where: { id },
        data: { status: dto.status as never },
      });
    } else {
      const order = await this.prisma.payoutOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      return this.prisma.payoutOrder.update({
        where: { id },
        data: { status: dto.status as never },
      });
    }
  }

  private formatPayoutDetail(order: {
    id: string;
    requestId: string;
    merchant: { name: string };
    trader?: { user: { email: string } } | null;
    amount: unknown;
    currency: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      type: 'PAYOUT',
      externalId: order.requestId,
      merchantName: order.merchant.name,
      traderName: order.trader?.user?.email ?? null,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      requisites: null,
      statusHistory: [],
    };
  }
}

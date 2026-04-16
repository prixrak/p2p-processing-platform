import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  PaymentMethodsService,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './payment-methods.service';
import { UserRole } from '@p2p/shared';

@ApiTags('Payment Methods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PaymentMethodsController {
  constructor(private readonly svc: PaymentMethodsService) {}

  @Get('payment-methods')
  @ApiOperation({ summary: 'List payment methods' })
  @ApiQuery({ name: 'countryId', required: false })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(
    @Query('countryId') countryId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.svc.findAll(countryId, activeOnly === 'true');
  }

  @Post('admin/payment-methods')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create payment method' })
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.svc.create(dto);
  }

  @Patch('admin/payment-methods/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update payment method' })
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.svc.update(id, dto);
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiSecurity, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PayInOrderStatus, UserRole } from '@p2p/shared';
import { HmacAuthGuard } from '../../common/guards/hmac-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MerchantId } from '../../common/decorators/merchant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayinService } from './payin.service';
import {
  UploadOrderDto,
  UpdateOrderDto,
  OrderInfoDto,
  H2hInitDto,
  H2hCheckAvailabilityDto,
  BanksQueryDto,
  AppealSendDto,
  TraderConfirmPaidDto,
  TraderCancelOrderDto,
} from './dto';

@ApiTags('Pay-In (External)')
@ApiSecurity('hmac-auth')
@UseGuards(HmacAuthGuard)
@Controller('external/v1/payin')
export class PayinController {
  constructor(private readonly payinService: PayinService) {}

  @Post('upload_order')
  @ApiOperation({ summary: 'Create a new Pay-In order' })
  async uploadOrder(
    @MerchantId() merchantId: string,
    @Body() dto: UploadOrderDto,
  ) {
    return this.payinService.uploadOrder(merchantId, dto);
  }

  @Post('update_order')
  @ApiOperation({ summary: 'Update order status (VERIFIED or CANCELED)' })
  async updateOrder(
    @MerchantId() merchantId: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.payinService.updateOrder(merchantId, dto);
  }

  @Post('update_order_with_proofs')
  @ApiOperation({ summary: 'Update order status with proof files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files'))
  async updateOrderWithProofs(
    @MerchantId() merchantId: string,
    @Body('id') id: string,
    @Body('status') status: PayInOrderStatus,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const mapped = (files ?? []).map((f) => ({
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      buffer: f.buffer,
    }));
    return this.payinService.updateOrderWithProofs(merchantId, id, status, mapped);
  }

  @Post('order_info')
  @ApiOperation({ summary: 'Get Pay-In order information' })
  async orderInfo(
    @MerchantId() merchantId: string,
    @Body() dto: OrderInfoDto,
  ) {
    return this.payinService.getOrderInfo(merchantId, dto.id, dto.request_id);
  }

  @Post('info')
  @ApiOperation({ summary: 'Get merchant profile and active Pay-In direction' })
  async info(@MerchantId() merchantId: string) {
    return this.payinService.getInfo(merchantId);
  }

  @Post('h2h_init')
  @ApiOperation({ summary: 'Create Pay-In order in H2H mode (no payment page)' })
  async h2hInit(
    @MerchantId() merchantId: string,
    @Body() dto: H2hInitDto,
  ) {
    return this.payinService.h2hInit(merchantId, dto);
  }

  @Post('h2h_check_availability')
  @ApiOperation({ summary: 'Check requisite availability for H2H payment' })
  async h2hCheckAvailability(
    @MerchantId() merchantId: string,
    @Body() dto: H2hCheckAvailabilityDto,
  ) {
    return this.payinService.h2hCheckAvailability(merchantId, dto);
  }

  @Post('banks')
  @ApiOperation({ summary: 'Get list of available banks' })
  async banks(
    @MerchantId() merchantId: string,
    @Body() dto: BanksQueryDto,
  ) {
    return this.payinService.getBanks(merchantId, dto.currency);
  }

  @Post('appeal/send')
  @ApiOperation({ summary: 'Submit appeal with proof files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files'))
  async appealSend(
    @MerchantId() merchantId: string,
    @Body() dto: AppealSendDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const mapped = (files ?? []).map((f) => ({
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      buffer: f.buffer,
    }));
    return this.payinService.appealSend(merchantId, dto, mapped);
  }
}

@ApiTags('Pay-In (Trader)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trader/payin')
export class PayinInternalController {
  constructor(private readonly payinService: PayinService) {}

  @Get('orders')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'List Pay-In orders assigned to the trader' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  async getTraderOrders(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: Record<string, string>,
  ) {
    return this.payinService.getTraderOrders(traderId, filters);
  }

  @Post('orders/:orderId/confirm')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader confirms payment received' })
  async traderConfirmPaid(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: TraderConfirmPaidDto,
  ) {
    return this.payinService.traderConfirmPaid(traderId, orderId, dto.actualAmount);
  }

  @Post('orders/:orderId/cancel')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader cancels an order' })
  async traderCancelOrder(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payinService.traderCancelOrder(traderId, orderId);
  }
}

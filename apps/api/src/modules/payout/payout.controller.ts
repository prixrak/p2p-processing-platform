import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { HmacAuthGuard } from '../../common/guards/hmac-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MerchantId } from '../../common/decorators/merchant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayoutService } from './payout.service';
import {
  OrderUploadDto,
  PayoutOrderInfoDto,
  AssignToTraderDto,
  TraderFailDto,
} from './dto';

@ApiTags('Pay-Out (External)')
@ApiSecurity('hmac-auth')
@UseGuards(HmacAuthGuard)
@Controller('external/v1/payout')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post('order_upload')
  @ApiOperation({ summary: 'Create a new Pay-Out order' })
  async orderUpload(
    @MerchantId() merchantId: string,
    @Body() dto: OrderUploadDto,
  ) {
    return this.payoutService.orderUpload(merchantId, dto);
  }

  @Post('order_info')
  @ApiOperation({ summary: 'Get Pay-Out order information' })
  async orderInfo(
    @MerchantId() merchantId: string,
    @Body() dto: PayoutOrderInfoDto,
  ) {
    return this.payoutService.getOrderInfo(merchantId, dto.id, dto.request_id);
  }

  @Post('info')
  @ApiOperation({ summary: 'Get merchant profile and active Pay-Out direction' })
  async info(@MerchantId() merchantId: string) {
    return this.payoutService.getInfo(merchantId);
  }
}

@ApiTags('Pay-Out (Trader/Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trader/payout')
export class PayoutInternalController {
  constructor(private readonly payoutService: PayoutService) {}

  /**
   * GET /api/trader/payout/pool
   * Returns PENDING orders without an assigned trader, filtered by the trader's payout limits.
   * Only orders within the trader's configured min/max limit range are shown.
   */
  @Get('pool')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Get public pool of unassigned Pay-Out orders (filtered by trader limits)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPool(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: Record<string, string>,
  ) {
    return this.payoutService.getPool(traderId, filters);
  }

  /**
   * GET /api/trader/payout/orders
   * Orders already assigned to this trader.
   */
  @Get('orders')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'List Pay-Out orders assigned to the trader' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTraderOrders(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: Record<string, string>,
  ) {
    return this.payoutService.getTraderOrders(traderId, filters);
  }

  /**
   * POST /api/trader/payout/assign
   * Admin or support assigns a PENDING pool order to a specific trader.
   */
  @Post('assign')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Admin/Support assigns a pool payout order to a trader' })
  async assignToTrader(@Body() dto: AssignToTraderDto) {
    return this.payoutService.assignToTrader(dto.orderId, dto.traderId);
  }

  /**
   * POST /api/trader/payout/orders/:orderId/take
   * Trader takes an order from the public pool (PENDING → NEW, assigns self).
   */
  @Post('orders/:orderId/take')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader takes a pool order into their work queue (PENDING → NEW)' })
  async traderTakeFromPool(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.traderTakeFromPool(traderId, orderId);
  }

  /**
   * POST /api/trader/payout/orders/:orderId/process
   * Trader moves their NEW order into active processing (NEW → PROCESSING).
   */
  @Post('orders/:orderId/process')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader starts active processing of a NEW order (NEW → PROCESSING)' })
  async traderStartProcessing(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.traderStartProcessing(traderId, orderId);
  }

  @Post('orders/:orderId/complete')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader marks order as completed (PROCESSING → COMPLETED)' })
  async traderComplete(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.traderComplete(traderId, orderId);
  }

  @Post('orders/:orderId/fail')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Trader marks order as failed (PROCESSING → FAILED)' })
  async traderFail(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: TraderFailDto,
  ) {
    return this.payoutService.traderFail(traderId, orderId, dto.reason);
  }
}

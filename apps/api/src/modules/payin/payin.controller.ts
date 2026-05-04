import {
    Body,
    Controller,
    Get,
    Header,
    MessageEvent,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Sse,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SkipThrottle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiProduces, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_MULTIPART_FILES_PER_REQUEST,
  PayInOrderStatus,
  UserRole,
} from '@p2p/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MerchantId } from '../../common/decorators/merchant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { HmacAuthGuard } from '../../common/guards/hmac-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
    AppealSendDto,
    BanksQueryDto,
    H2hCheckAvailabilityDto,
    H2hInitDto,
    OrderInfoDto,
    TraderConfirmPaidDto,
    TraderOrderFiltersDto,
    UpdateOrderDto,
    UploadOrderDto
} from './dto';
import { PayinService } from './payin.service';
import { PayinRealtimeService } from './payin-realtime.service';

@ApiTags('Pay-In (External)')
@ApiSecurity('hmac-auth')
@UseGuards(HmacAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
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
  @UseInterceptors(
    FilesInterceptor('files', MAX_MULTIPART_FILES_PER_REQUEST, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
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
  @UseInterceptors(
    FilesInterceptor('files', MAX_MULTIPART_FILES_PER_REQUEST, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
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
  constructor(
    private readonly payinService: PayinService,
    private readonly payinRealtime: PayinRealtimeService,
  ) {}

  @SkipThrottle()
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'SSE stream for Pay-In order updates for this trader' })
  @ApiProduces('text/event-stream')
  streamTraderPayin(
    @CurrentUser('traderId') traderId: string,
  ): Observable<MessageEvent> {
    return this.payinRealtime.streamForTrader(traderId);
  }

  @Get('orders')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'List Pay-In orders assigned to the trader' })
  async getTraderOrders(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: TraderOrderFiltersDto,
  ) {
    return this.payinService.getTraderOrders(traderId, filters);
  }

  @Post('orders/:orderId/confirm')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Trader confirms payment received',
    description:
      'Sets PAID, UNDERPAID, or OVERPAID from actualAmount. Allowed when status is NEW or VERIFIED so the trader can confirm from their bank receipt before the payer marks payment sent in the widget.',
  })
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

  @Post('orders/:orderId/fork-verification')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Submit FORK exchange reference and optional chat screenshots',
    description:
      'For Pay-In orders assigned on FORK routing. Stores a counterparty or exchange reference and attaches image/PDF proofs (same limits as appeal uploads).',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_MULTIPART_FILES_PER_REQUEST, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async traderForkVerification(
    @CurrentUser('traderId') traderId: string,
    @CurrentUser('id') userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body('exchange_reference') exchangeReference: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const mapped = (files ?? []).map((f) => ({
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      buffer: f.buffer,
    }));
    return this.payinService.traderSubmitForkVerification(
      traderId,
      userId,
      orderId,
      exchangeReference ?? '',
      mapped,
    );
  }
}

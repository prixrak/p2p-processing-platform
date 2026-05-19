import {
  Controller,
  Delete,
  Post,
  Get,
  Body,
  HttpCode,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  MessageEvent,
  Res,
  Req,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Response, type Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiSecurity, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@p2p/shared';
import { HmacAuthGuard } from '../../common/guards/hmac-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MerchantId } from '../../common/decorators/merchant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatisticsQueryDto } from '../../common/dto/statistics-query.dto';
import { PayoutService } from './payout.service';
import { PayoutRealtimeService } from './payout-realtime.service';
import { buildExternalOrderCreationMeta } from '../../common/utils/partner-request-meta';
import { SseStream } from '../../common/decorators/sse-stream.decorator';
import {
  OrderUploadDto,
  PayoutOrderInfoDto,
  AssignToTraderDto,
  TraderFailDto,
  PayoutListFiltersDto,
  SpecialistCompleteDto,
  AttachCompletionProofDto,
} from './dto';

@ApiTags('Pay-Out (External)')
@ApiSecurity('hmac-auth')
@UseGuards(HmacAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('external/v1/payout')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post('order_upload')
  @ApiOperation({ summary: 'Create a new Pay-Out order' })
  async orderUpload(
    @MerchantId() merchantId: string,
    @Body() dto: OrderUploadDto,
    @Req() req: Request,
  ) {
    return this.payoutService.orderUpload(merchantId, dto, buildExternalOrderCreationMeta(req));
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
  constructor(
    private readonly payoutService: PayoutService,
    private readonly payoutRealtime: PayoutRealtimeService,
  ) {}

  @SseStream('stream')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'SSE stream for Pay-Out orders and pool updates for this trader' })
  streamTraderPayout(
    @CurrentUser('traderId') traderId: string,
  ): Observable<MessageEvent> {
    return this.payoutRealtime.streamForTrader(traderId);
  }

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
  async getPool(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: PayoutListFiltersDto,
  ) {
    return this.payoutService.getPool(traderId, filters);
  }

  @Get('orders/:orderId/status-history')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Status change timeline for a Pay-Out order assigned to this trader' })
  async getTraderOrderStatusHistory(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const items = await this.payoutService.getPayoutOrderStatusHistoryForTrader(traderId, orderId);
    return {
      items: items.map((e) => ({
        status: e.status,
        timestamp: e.timestamp.toISOString(),
        actor: e.actor,
        note: e.note ?? null,
      })),
    };
  }

  @Get('orders')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'List Pay-Out orders assigned to the trader',
    description:
      'Use query `queue=in_progress` for active work (NEW, PROCESSING) or `queue=history` for completed/failed. Optional `status` narrows within that queue.',
  })
  async getTraderOrders(
    @CurrentUser('traderId') traderId: string,
    @Query() filters: PayoutListFiltersDto,
  ) {
    return this.payoutService.getTraderOrders(traderId, filters);
  }

  /**
   * POST /api/trader/payout/assign
   * Admin or support assigns a PENDING pool order to a specific trader.
   */
  @Post('assign')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Admin/Support assigns a pool payout order to a trader or Pay-Out specialist' })
  async assignToTrader(@Body() dto: AssignToTraderDto) {
    return this.payoutService.assignToTrader({
      orderId: dto.orderId,
      traderId: dto.traderId,
      payoutTraderId: dto.payoutTraderId,
    });
  }

  /**
   * POST /api/trader/payout/orders/:orderId/take
   * Trader takes an order from the public pool (PENDING → PROCESSING, assigns self).
   */
  @Post('orders/:orderId/take')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Trader takes a pool order into their work queue (PENDING → PROCESSING)',
  })
  async traderTakeFromPool(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.traderTakeFromPool(traderId, orderId);
  }

  @Post('orders/:orderId/cancel')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Return assigned payout to the shared pool (NEW/PROCESSING → PENDING, no merchant refund)',
  })
  async traderCancelToPool(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.traderCancelToPool(traderId, orderId);
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
  @ApiOperation({
    summary: 'Trader marks order as completed (PROCESSING → COMPLETED)',
    description:
      'Optional JSON body: `completion_proof_file_id` (single UUID) and/or `completion_proof_file_ids` (array), files uploaded via POST /api/files/upload by this user. Capped per order (see platform limits).',
  })
  async traderComplete(
    @CurrentUser('traderId') traderId: string,
    @CurrentUser('id') userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: SpecialistCompleteDto,
  ) {
    return this.payoutService.traderComplete(traderId, orderId, userId, body);
  }

  @Post('orders/:orderId/completion-proof')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Append payment receipts while processing or after completion',
    description:
      'For orders assigned to this trader in PROCESSING or COMPLETED. Body: `completion_proof_file_ids` and/or `completion_proof_file_id`. Files must be uploaded first via POST /api/files/upload. Respects per-order max; duplicates ignored.',
  })
  async traderAttachCompletionProof(
    @CurrentUser('traderId') traderId: string,
    @CurrentUser('id') userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: AttachCompletionProofDto,
  ) {
    return this.payoutService.traderAttachCompletionProof(traderId, userId, orderId, body);
  }

  @Delete('orders/:orderId/completion-proof/:fileId')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary: 'Detach a single payment receipt from a pay-out (and purge the S3 object if orphan)',
    description:
      'Removes the file from this order. The underlying file is hard-deleted from S3 and the file row is dropped when no other record references it.',
  })
  async traderDetachCompletionProof(
    @CurrentUser('traderId') traderId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.payoutService.traderDetachCompletionProof(traderId, role, userId, orderId, fileId);
  }

  @Post('orders/:orderId/fail')
  @Roles(UserRole.TRADER)
  @ApiOperation({
    summary:
      'Reject payout: mark FAILED, refund merchant when applicable (PROCESSING only). `reason_other_note` is required when `reason` is OTHER or omitted.',
  })
  async traderFail(
    @CurrentUser('traderId') traderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: TraderFailDto,
  ) {
    return this.payoutService.traderFail(traderId, orderId, dto);
  }
}

@ApiTags('Pay-Out (Payout specialist)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payout-trader/payout')
export class PayoutSpecialistInternalController {
  constructor(
    private readonly payoutService: PayoutService,
    private readonly payoutRealtime: PayoutRealtimeService,
  ) {}

  @SseStream('stream')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'SSE stream for specialist pool and assigned Pay-Out orders' })
  streamPayoutSpecialist(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
  ): Observable<MessageEvent> {
    return this.payoutRealtime.streamForPayoutSpecialist(payoutTraderId);
  }

  @Get('pool')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Pool B — unassigned orders for your geo' })
  async getPool(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query() filters: PayoutListFiltersDto,
  ) {
    return this.payoutService.getSpecialistPool(payoutTraderId, filters);
  }

  @Get('me/summary')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Cabinet summary: USDT balance, geo, payout rate' })
  async getMySummary(@CurrentUser('payoutTraderId') payoutTraderId: string) {
    return this.payoutService.getSpecialistSummary(payoutTraderId);
  }

  @Get('me/statistics')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Pay-Out statistics for this specialist (completed volume by window)' })
  @ApiQuery({ name: 'period', required: false, enum: ['24h', '7d', '30d', '90d'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getStatistics(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query() dto: StatisticsQueryDto,
  ) {
    return this.payoutService.getSpecialistStatistics(payoutTraderId, dto);
  }

  @Get('me/notifications')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Recent ledger, settlement, and order notifications' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getNotifications(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.payoutService.getSpecialistNotifications(payoutTraderId, limit);
  }

  @Get('me/balance-ledger')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'USDT balance transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getBalanceLedger(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.payoutService.getSpecialistLedger(payoutTraderId, page, limit);
  }

  @Get('me/settlements')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Settlement records for this specialist' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMySettlements(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.payoutService.getSpecialistSettlementHistory(payoutTraderId, page, limit);
  }

  @Get('orders/:orderId/status-history')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Status change timeline for a Pay-Out order assigned to this specialist' })
  async getSpecialistOrderStatusHistory(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const items = await this.payoutService.getPayoutOrderStatusHistoryForSpecialist(
      payoutTraderId,
      orderId,
    );
    return {
      items: items.map((e) => ({
        status: e.status,
        timestamp: e.timestamp.toISOString(),
        actor: e.actor,
        note: e.note ?? null,
      })),
    };
  }

  @Get('orders/csv')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary: 'Export orders matching list filters as CSV',
  })
  async exportOrdersCsv(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query() filters: PayoutListFiltersDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.payoutService.exportSpecialistOrdersCsv(payoutTraderId, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="payout-specialist-orders.csv"',
    );
    res.send(csv);
  }

  @Get('orders')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Your assigned Pay-Out orders (same queue params as standard trader)' })
  async getOrders(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Query() filters: PayoutListFiltersDto,
  ) {
    return this.payoutService.getSpecialistOrders(payoutTraderId, filters);
  }

  @Post('orders/:orderId/take')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Take order from pool B into work queue' })
  async takeFromPool(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.specialistTakeFromPool(payoutTraderId, orderId);
  }

  @Post('orders/:orderId/process')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary: 'Start processing (NEW → PROCESSING, or no-op when already PROCESSING)',
  })
  async startProcessing(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.specialistStartProcessing(payoutTraderId, orderId);
  }

  @Post('orders/:orderId/complete')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({ summary: 'Confirm payout completed (optional completion proof file id or ids)' })
  async complete(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @CurrentUser('id') userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: SpecialistCompleteDto,
  ) {
    return this.payoutService.specialistComplete(payoutTraderId, orderId, userId, body);
  }

  @Post('orders/:orderId/completion-proof')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary: 'Append payment receipts while processing or after completion',
    description:
      'For orders assigned to this specialist in PROCESSING or COMPLETED. Body: `completion_proof_file_ids` and/or `completion_proof_file_id`. Files must be uploaded first via POST /api/files/upload. Respects per-order max; duplicates ignored.',
  })
  async specialistAttachCompletionProof(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @CurrentUser('id') userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: AttachCompletionProofDto,
  ) {
    return this.payoutService.specialistAttachCompletionProof(payoutTraderId, userId, orderId, body);
  }

  @Delete('orders/:orderId/completion-proof/:fileId')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary: 'Detach a single payment receipt from a pay-out (and purge the S3 object if orphan)',
    description:
      'Removes the file from this order. The underlying file is hard-deleted from S3 and the file row is dropped when no other record references it.',
  })
  async specialistDetachCompletionProof(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.payoutService.specialistDetachCompletionProof(
      payoutTraderId,
      role,
      userId,
      orderId,
      fileId,
    );
  }

  @Post('orders/:orderId/cancel')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary: 'Return assigned payout to pool B (NEW/PROCESSING → PENDING, no merchant refund)',
  })
  async cancelToPool(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payoutService.specialistCancelToPool(payoutTraderId, orderId);
  }

  @Post('orders/:orderId/fail')
  @Roles(UserRole.PAYOUT_TRADER)
  @ApiOperation({
    summary:
      'Reject payout: mark FAILED, refund merchant when applicable (PROCESSING only). `reason_other_note` is required when `reason` is OTHER or omitted.',
  })
  async fail(
    @CurrentUser('payoutTraderId') payoutTraderId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: TraderFailDto,
  ) {
    return this.payoutService.specialistFail(payoutTraderId, orderId, dto);
  }
}

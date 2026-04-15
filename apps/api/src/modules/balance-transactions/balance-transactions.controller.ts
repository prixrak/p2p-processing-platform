import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BalanceTransactionsService } from './balance-transactions.service';
import { MaxPageSizePipe } from '../../common/pipes/max-page-size.pipe';
import { BalanceTransactionType } from '@prisma/client';
import { UserRole } from '@p2p/shared';

@ApiTags('Balance Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BalanceTransactionsController {
  constructor(private readonly svc: BalanceTransactionsService) {}

  @Get('api/trader/balance/transactions')
  @Roles(UserRole.TRADER)
  @ApiOperation({ summary: 'Get own balance transaction history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'currency', required: false })
  @ApiQuery({ name: 'type', required: false, enum: BalanceTransactionType })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async traderHistory(
    @CurrentUser('traderId') traderId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe, MaxPageSizePipe) limit: number,
    @Query('currency') currency?: string,
    @Query('type') type?: BalanceTransactionType,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (!traderId) {
      throw new ForbiddenException('Trader profile not found');
    }
    return this.svc.findByTrader(traderId, { type, currency, dateFrom, dateTo }, page, limit);
  }

  // ── Admin / Owner: all transactions ────────────────────────────────────────

  @Get('api/admin/balance-transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all balance transactions' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'traderId', required: false })
  @ApiQuery({ name: 'currency', required: false })
  @ApiQuery({ name: 'type', required: false, enum: BalanceTransactionType })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async adminList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe, MaxPageSizePipe) limit: number,
    @Query('traderId') traderId?: string,
    @Query('currency') currency?: string,
    @Query('type') type?: BalanceTransactionType,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.svc.findAll({ traderId, type, currency, dateFrom, dateTo }, page, limit);
  }
}

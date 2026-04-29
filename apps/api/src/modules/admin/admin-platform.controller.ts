import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@p2p/shared';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { PlatformTreasuryService } from './platform-treasury.service';
import { PlatformWithdrawalCreateDto } from './dto/platform-withdrawal-create.dto';
import { WalletDepositConfirmDto } from './dto/wallet-deposit-confirm.dto';

@ApiTags('Admin Platform Treasury')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Controller('admin/platform')
export class AdminPlatformController {
  constructor(
    private readonly exchangeRate: ExchangeRateService,
    private readonly treasury: PlatformTreasuryService,
  ) {}

  @Get('exchange-rate')
  @ApiOperation({
    summary: 'Primary Binance P2P pair parser status (Redis + last log sample, Block 5 section 6.4)',
  })
  getExchangeRateStatus() {
    return this.exchangeRate.getStatusForAdmin();
  }

  @Get('income/summary')
  @ApiOperation({ summary: 'Aggregate platform_income (USDT + booked local fiat)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  incomeSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    return this.treasury.incomeSummary(from, to);
  }

  @Get('operations/summary')
  @ApiOperation({
    summary:
      'Volumes, conversion, trader rate-bonus USDT estimate, reference local fiat at current parser P (Block 5 section 6.4)',
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async operationsSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    const p = await this.exchangeRate.getCachedParserFiatPerUsdt('UAH');
    return this.treasury.operationsSummary(from, to, p);
  }

  @Get('income/recent')
  @ApiOperation({ summary: 'Recent platform_income rows' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  incomeRecent(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.treasury.incomeRecent(page, Math.min(limit, 100));
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Cold-wallet withdrawal audit log' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listWithdrawals(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.treasury.listWithdrawals(page, Math.min(limit, 100));
  }

  @Post('withdrawals')
  @ApiOperation({
    summary: 'Record a margin withdrawal to cold storage (manual tx; audit only)',
  })
  recordWithdrawal(
    @Body() dto: PlatformWithdrawalCreateDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.treasury.recordWithdrawal(dto, adminId);
  }

  @Get('wallet-deposits')
  @ApiOperation({ summary: 'Trader on-chain USDT deposits (manual + future automated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'traderId', required: false })
  listDeposits(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('traderId') traderId?: string,
  ) {
    return this.treasury.listWalletDeposits(page, Math.min(limit, 100), traderId);
  }

  @Post('wallet-deposits/confirm')
  @ApiOperation({
    summary: 'Confirm on-chain deposit and credit trader USDT (TOP_UP)',
  })
  confirmDeposit(
    @Body() dto: WalletDepositConfirmDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.treasury.confirmWalletDeposit(dto, adminId);
  }
}

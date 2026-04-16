import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BalanceTransactionsService } from './balance-transactions.service';
import { MaxPageSizePipe } from '../../common/pipes/max-page-size.pipe';
import { BalanceTransactionType } from '@prisma/client';
import { UserRole } from '@p2p/shared';

class AdminAdjustBalanceDto {
  @ApiProperty({ description: 'Trader profile ID' })
  @IsUUID()
  @IsNotEmpty()
  traderId: string;

  @ApiProperty({ enum: ['MANUAL_CREDIT', 'MANUAL_DEBIT'] })
  @IsEnum(['MANUAL_CREDIT', 'MANUAL_DEBIT'])
  type: 'MANUAL_CREDIT' | 'MANUAL_DEBIT';

  @ApiProperty({ description: 'Positive amount to credit or debit' })
  @IsNumber()
  @Min(0.0001)
  amount: number;

  @ApiProperty({ description: 'Currency code, e.g. UAH' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}

@ApiTags('Balance Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BalanceTransactionsController {
  constructor(private readonly svc: BalanceTransactionsService) {}

  @Get('trader/balance/transactions')
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

  // ── Admin / Owner: manual credit / debit ───────────────────────────────────

  @Post('admin/balance-transactions/adjust')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Manually credit or debit a trader balance (no settlement record)' })
  async adminAdjust(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminAdjustBalanceDto,
  ) {
    return this.svc.adminAdjust({ ...dto, adminId });
  }

  // ── Admin / Owner: all transactions ────────────────────────────────────────

  @Get('admin/balance-transactions')
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

import { Module } from '@nestjs/common';
import { TradersService } from './traders.service';
import { TradersController } from './traders.controller';
import { TraderDashboardController } from './trader-dashboard.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

@Module({
  imports: [BalanceTransactionsModule],
  controllers: [TradersController, TraderDashboardController],
  providers: [TradersService],
  exports: [TradersService],
})
export class TradersModule {}

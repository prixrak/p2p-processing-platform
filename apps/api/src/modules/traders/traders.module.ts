import { Module } from '@nestjs/common';
import { TradersService } from './traders.service';
import { TradersController } from './traders.controller';
import { TraderDashboardController } from './trader-dashboard.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

import { CascadeModule } from '../cascade/cascade.module';

@Module({
  imports: [BalanceTransactionsModule, CascadeModule],
  controllers: [TradersController, TraderDashboardController],
  providers: [TradersService],
  exports: [TradersService],
})
export class TradersModule {}

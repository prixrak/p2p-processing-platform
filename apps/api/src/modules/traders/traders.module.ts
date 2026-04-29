import { Module } from '@nestjs/common';
import { TradersService } from './traders.service';
import { TradersController } from './traders.controller';
import { TraderDashboardController } from './trader-dashboard.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';

import { CascadeModule } from '../cascade/cascade.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [BalanceTransactionsModule, CascadeModule, PlatformSettingsModule],
  controllers: [TradersController, TraderDashboardController],
  providers: [TradersService],
  exports: [TradersService],
})
export class TradersModule {}

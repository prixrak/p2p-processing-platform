import { Module } from '@nestjs/common';
import { TradersService } from './traders.service';
import { TradersController } from './traders.controller';
import { TraderDashboardController } from './trader-dashboard.controller';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { WalletDepositsModule } from '../wallet-deposits/wallet-deposits.module';

import { CascadeModule } from '../cascade/cascade.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { PayinModule } from '../payin/payin.module';
import { PayoutModule } from '../payout/payout.module';

@Module({
  imports: [
    BalanceTransactionsModule,
    WalletDepositsModule,
    CascadeModule,
    PlatformSettingsModule,
    CurrenciesModule,
    PayinModule,
    PayoutModule,
  ],
  controllers: [TradersController, TraderDashboardController],
  providers: [TradersService],
  exports: [TradersService],
})
export class TradersModule {}

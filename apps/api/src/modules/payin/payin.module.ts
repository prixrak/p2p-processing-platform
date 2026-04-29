import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinRealtimeService } from './payin-realtime.service';
import { PayinController, PayinInternalController } from './payin.controller';
import { PaymentPageController } from './payment-page.controller';
import { RequisitesModule } from '../requisites/requisites.module';
import { BanksModule } from '../banks/banks.module';
import { FilesModule } from '../files/files.module';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [
    RequisitesModule,
    BanksModule,
    FilesModule,
    MerchantDirectionsModule,
    BalanceTransactionsModule,
    PlatformSettingsModule,
  ],
  controllers: [PayinController, PayinInternalController, PaymentPageController],
  providers: [PayinService, PayinRealtimeService],
  exports: [PayinService, PayinRealtimeService],
})
export class PayinModule {}

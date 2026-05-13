import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinRealtimeService } from './payin-realtime.service';
import { PayinController, PayinInternalController } from './payin.controller';
import { PaymentPageController } from './payment-page.controller';
import { PayinProviderWebhookController } from './payin-provider-webhook.controller';
import { RequisitesModule } from '../requisites/requisites.module';
import { BanksModule } from '../banks/banks.module';
import { FilesModule } from '../files/files.module';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';
import { BalanceTransactionsModule } from '../balance-transactions/balance-transactions.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CascadeModule } from '../cascade/cascade.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { PayinProviderModule } from '../payin-provider/payin-provider.module';

@Module({
  imports: [
    RequisitesModule,
    BanksModule,
    FilesModule,
    MerchantDirectionsModule,
    BalanceTransactionsModule,
    PlatformSettingsModule,
    CascadeModule,
    TelegramModule,
    CurrenciesModule,
    PayinProviderModule,
  ],
  controllers: [PayinController, PayinInternalController, PaymentPageController, PayinProviderWebhookController],
  providers: [PayinService, PayinRealtimeService],
  exports: [PayinService, PayinRealtimeService],
})
export class PayinModule {}

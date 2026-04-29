import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantCabinetController } from './merchant-cabinet.controller';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';
import { PayinModule } from '../payin/payin.module';
import { PayoutModule } from '../payout/payout.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  imports: [MerchantDirectionsModule, PayinModule, PayoutModule, SettlementsModule],
  controllers: [MerchantsController, MerchantDashboardController, MerchantCabinetController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

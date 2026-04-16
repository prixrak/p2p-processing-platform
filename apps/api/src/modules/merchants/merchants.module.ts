import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantCabinetController } from './merchant-cabinet.controller';
import { MerchantDirectionsModule } from '../merchant-directions/merchant-directions.module';

@Module({
  imports: [MerchantDirectionsModule],
  controllers: [MerchantsController, MerchantDashboardController, MerchantCabinetController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

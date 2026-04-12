import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { MerchantDashboardController } from './merchant-dashboard.controller';

@Module({
  controllers: [MerchantsController, MerchantDashboardController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

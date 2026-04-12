import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutController, PayoutInternalController } from './payout.controller';

@Module({
  controllers: [PayoutController, PayoutInternalController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}

import { Module } from '@nestjs/common';
import { SupportDashboardController } from './support-dashboard.controller';
import { SupportCabinetController } from './support-cabinet.controller';
import { PayinModule } from '../payin/payin.module';
import { PayoutModule } from '../payout/payout.module';

@Module({
  imports: [PayinModule, PayoutModule],
  controllers: [SupportDashboardController, SupportCabinetController],
})
export class SupportModule {}

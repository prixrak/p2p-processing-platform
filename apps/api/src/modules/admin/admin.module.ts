import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminPlatformController } from './admin-platform.controller';
import { AdminCascadeController } from './admin-cascade.controller';
import { AdminPayoutPoolController } from './admin-payout-pool.controller';
import { AdminApplicationLogsController } from './admin-application-logs.controller';
import { AdminApplicationLogsService } from './admin-application-logs.service';
import { PlatformTreasuryService } from './platform-treasury.service';
import { PayinModule } from '../payin/payin.module';
import { WalletDepositsModule } from '../wallet-deposits/wallet-deposits.module';
import { CascadeModule } from '../cascade/cascade.module';
import { TradersModule } from '../traders/traders.module';
import { PayoutModule } from '../payout/payout.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [
    PayinModule,
    WalletDepositsModule,
    CascadeModule,
    TradersModule,
    PayoutModule,
    PlatformSettingsModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminOrdersController,
    AdminPlatformController,
    AdminCascadeController,
    AdminPayoutPoolController,
    AdminApplicationLogsController,
  ],
  providers: [PlatformTreasuryService, AdminApplicationLogsService],
})
export class AdminModule {}

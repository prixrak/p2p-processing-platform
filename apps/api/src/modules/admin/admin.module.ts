import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminPlatformController } from './admin-platform.controller';
import { AdminCascadeController } from './admin-cascade.controller';
import { PlatformTreasuryService } from './platform-treasury.service';
import { PayinModule } from '../payin/payin.module';
import { WalletDepositsModule } from '../wallet-deposits/wallet-deposits.module';
import { CascadeModule } from '../cascade/cascade.module';
import { TradersModule } from '../traders/traders.module';

@Module({
  imports: [PayinModule, WalletDepositsModule, CascadeModule, TradersModule],
  controllers: [
    AdminDashboardController,
    AdminOrdersController,
    AdminPlatformController,
    AdminCascadeController,
  ],
  providers: [PlatformTreasuryService],
})
export class AdminModule {}

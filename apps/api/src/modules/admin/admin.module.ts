import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminPlatformController } from './admin-platform.controller';
import { PlatformTreasuryService } from './platform-treasury.service';
import { PayinModule } from '../payin/payin.module';
import { WalletDepositsModule } from '../wallet-deposits/wallet-deposits.module';

@Module({
  imports: [PayinModule, WalletDepositsModule],
  controllers: [AdminDashboardController, AdminOrdersController, AdminPlatformController],
  providers: [PlatformTreasuryService],
})
export class AdminModule {}

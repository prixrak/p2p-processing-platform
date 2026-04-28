import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { PayinModule } from '../payin/payin.module';

@Module({
  imports: [PayinModule],
  controllers: [AdminDashboardController, AdminOrdersController],
})
export class AdminModule {}

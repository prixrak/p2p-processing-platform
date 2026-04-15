import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';

@Module({
  controllers: [AdminDashboardController, AdminOrdersController],
})
export class AdminModule {}

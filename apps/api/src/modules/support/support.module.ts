import { Module } from '@nestjs/common';
import { SupportDashboardController } from './support-dashboard.controller';
import { SupportCabinetController } from './support-cabinet.controller';

@Module({
  controllers: [SupportDashboardController, SupportCabinetController],
})
export class SupportModule {}

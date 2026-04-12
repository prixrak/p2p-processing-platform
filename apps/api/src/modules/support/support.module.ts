import { Module } from '@nestjs/common';
import { SupportDashboardController } from './support-dashboard.controller';

@Module({
  controllers: [SupportDashboardController],
})
export class SupportModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OpsAlertsService } from './ops-alerts.service';
import { OpsEmailProcessor } from './ops-email.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'ops-email' })],
  providers: [OpsAlertsService, OpsEmailProcessor],
  exports: [OpsAlertsService],
})
export class OpsAlertsModule {}

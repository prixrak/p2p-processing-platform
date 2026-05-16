import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookProcessor } from '../../workers/webhook.processor';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'webhook' }),
    OpsAlertsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}

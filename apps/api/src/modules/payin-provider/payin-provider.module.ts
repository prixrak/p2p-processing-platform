import { Module } from '@nestjs/common';
import { PayinProviderService } from './payin-provider.service';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { OpsAlertsModule } from '../ops-alerts/ops-alerts.module';

@Module({
  imports: [PlatformSettingsModule, OpsAlertsModule],
  providers: [PayinProviderService],
  exports: [PayinProviderService],
})
export class PayinProviderModule {}

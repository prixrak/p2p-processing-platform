import { Module } from '@nestjs/common';
import { PayinProviderService } from './payin-provider.service';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [PlatformSettingsModule],
  providers: [PayinProviderService],
  exports: [PayinProviderService],
})
export class PayinProviderModule {}

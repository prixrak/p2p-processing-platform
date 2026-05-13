import { Module } from '@nestjs/common';
import { CascadeService } from './cascade.service';
import { CascadeRedisStateService } from './cascade-redis-state.service';
import { CurrenciesModule } from '../currencies/currencies.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [CurrenciesModule, PlatformSettingsModule],
  providers: [CascadeRedisStateService, CascadeService],
  exports: [CascadeRedisStateService, CascadeService],
})
export class CascadeModule {}

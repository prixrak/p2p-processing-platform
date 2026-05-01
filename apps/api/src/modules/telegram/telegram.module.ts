import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramProcessor } from '../../workers/telegram.processor';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [PlatformSettingsModule, CurrenciesModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramProcessor],
  exports: [TelegramService],
})
export class TelegramModule {}

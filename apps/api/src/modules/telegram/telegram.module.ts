import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramRealtimeService } from './telegram-realtime.service';
import { TelegramProcessor } from '../../workers/telegram.processor';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [PlatformSettingsModule, CurrenciesModule],
  controllers: [TelegramController, TelegramBotController],
  providers: [TelegramService, TelegramBotService, TelegramRealtimeService, TelegramProcessor],
  exports: [TelegramService, TelegramRealtimeService],
})
export class TelegramModule {}

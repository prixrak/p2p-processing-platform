import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramProcessor } from '../../workers/telegram.processor';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramProcessor],
  exports: [TelegramService],
})
export class TelegramModule {}

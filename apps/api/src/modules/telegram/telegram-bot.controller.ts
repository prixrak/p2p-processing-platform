import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { config } from '@p2p/config';
import { TelegramBotService, type TelegramUpdate } from './telegram-bot.service';
import { TelegramService } from './telegram.service';

@ApiTags('Telegram Bot')
@Controller('telegram/bot')
export class TelegramBotController {
  constructor(
    private readonly telegramBot: TelegramBotService,
    private readonly telegramService: TelegramService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram Bot API webhook (updates)' })
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
  ) {
    const expected = config.telegram.webhookSecret.trim();
    if (expected && secretToken !== expected) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    await this.telegramBot.handleUpdate(update);
    return { ok: true as const };
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link a Telegram chat via connect token (bot or internal tooling)' })
  async botConnect(@Body() body: { token: string; chatId: string }) {
    return this.telegramService.handleBotConnect(body.token, body.chatId);
  }
}

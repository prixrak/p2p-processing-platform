import { TelegramBotService } from './telegram-bot.service';

describe('TelegramBotService /start parsing', () => {
  it('accepts /start with token on the same line', async () => {
    const telegram = {
      handleBotConnect: jest.fn().mockResolvedValue({}),
      sendNotification: jest.fn().mockResolvedValue(true),
    };
    const bot = new TelegramBotService(telegram as never);

    await bot.handleUpdate({
      message: {
        chat: { id: 123 },
        text: '/start abcdef0123456789',
      },
    });

    expect(telegram.handleBotConnect).toHaveBeenCalledWith('abcdef0123456789', '123');
  });

  it('accepts /start@BotName with token', async () => {
    const telegram = {
      handleBotConnect: jest.fn().mockResolvedValue({}),
      sendNotification: jest.fn().mockResolvedValue(true),
    };
    const bot = new TelegramBotService(telegram as never);

    await bot.handleUpdate({
      message: {
        chat: { id: 456 },
        text: '/start@MyBot abcdef0123456789',
      },
    });

    expect(telegram.handleBotConnect).toHaveBeenCalledWith('abcdef0123456789', '456');
  });

  it('accepts a bare 64-char hex connect token', async () => {
    const token = 'ded30096e389a4002858af04635db52ef5167cabab6c450a574a4b8cacb5c374';
    const telegram = {
      handleBotConnect: jest.fn().mockResolvedValue({}),
      sendNotification: jest.fn().mockResolvedValue(true),
    };
    const bot = new TelegramBotService(telegram as never);

    await bot.handleUpdate({
      message: {
        chat: { id: 789 },
        text: token,
      },
    });

    expect(telegram.handleBotConnect).toHaveBeenCalledWith(token, '789');
  });
});

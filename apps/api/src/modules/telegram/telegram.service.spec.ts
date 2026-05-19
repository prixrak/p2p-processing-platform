import { BadRequestException } from '@nestjs/common';
import { TelegramService } from './telegram.service';

describe('TelegramService connect tokens', () => {
  function createService() {
    const prisma = {
      telegramSettings: {
        upsert: jest.fn().mockResolvedValue({ id: 'ts-1', isActive: true }),
      },
      payoutTraderTelegramSettings: {
        upsert: jest.fn(),
      },
    };
    const platformSettings = { findOne: jest.fn() };
    const currencies = { getUsdtCurrencyId: jest.fn() };
    const telegramRealtime = {
      publishTraderLinked: jest.fn(),
      publishPayoutTraderLinked: jest.fn(),
    };

    const service = new TelegramService(
      prisma as never,
      platformSettings as never,
      currencies as never,
      telegramRealtime as never,
    );

    return { service, prisma };
  }

  it('links a trader chat when connect token is valid', async () => {
    const { service, prisma } = createService();
    const token = await service.generateConnectToken('trader-1');

    const result = await service.handleBotConnect(token, '12345');

    expect(prisma.telegramSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { traderId: 'trader-1' },
        update: { chatId: '12345', isActive: true },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'ts-1' }));
  });

  it('rejects an unknown connect token', async () => {
    const { service } = createService();

    await expect(service.handleBotConnect('missing-token', '999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('consumes a connect token only once', async () => {
    const { service } = createService();
    const token = await service.generateConnectToken('trader-2');

    await service.handleBotConnect(token, '111');
    await expect(service.handleBotConnect(token, '222')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

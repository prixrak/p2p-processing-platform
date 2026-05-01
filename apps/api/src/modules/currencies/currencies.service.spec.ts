import { BadRequestException } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesService', () => {
  it('requireActiveCurrencyIdByCode rejects unknown codes', async () => {
    const prisma = {
      currency: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new CurrenciesService(prisma as never);

    await expect(service.requireActiveCurrencyIdByCode('XYZ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requireActiveCurrencyIdByCode rejects inactive currencies', async () => {
    const prisma = {
      currency: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cid',
          code: 'HUF',
          isActive: false,
        }),
      },
    };
    const service = new CurrenciesService(prisma as never);

    await expect(service.requireActiveCurrencyIdByCode('HUF')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

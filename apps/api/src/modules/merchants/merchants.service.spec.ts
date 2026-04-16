import { MerchantsService } from './merchants.service';
import { DirectionType } from '@p2p/shared';
import { ApiKeyDirection } from '@prisma/client';

jest.mock('../../common/utils/crypto', () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
}));

describe('MerchantsService', () => {
  const merchantId = '550e8400-e29b-41d4-a716-446655440001';

  function createService(prisma: {
    merchant: { findUnique: jest.Mock };
    merchantApiKey: { updateMany: jest.Mock; create: jest.Mock };
  }) {
    return new MerchantsService(prisma as any);
  }

  describe('generateApiKeys', () => {
    it('deactivates existing keys for the direction and returns a new pair', async () => {
      const prisma = {
        merchant: {
          findUnique: jest.fn().mockResolvedValue({
            id: merchantId,
            apiKeys: [],
          }),
        },
        merchantApiKey: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({
            id: 'new-key-id',
            merchantId,
            direction: ApiKeyDirection.PAYIN,
            publicKey: 'pk_payin_test',
            secretKeyHash: 'hash',
          }),
        },
      };

      const service = createService(prisma);
      const result = await service.generateApiKeys(merchantId, DirectionType.PAYIN);

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: merchantId } }),
      );
      expect(prisma.merchantApiKey.updateMany).toHaveBeenCalledWith({
        where: {
          merchantId,
          direction: ApiKeyDirection.PAYIN,
          isActive: true,
        },
        data: { isActive: false },
      });
      expect(prisma.merchantApiKey.create).toHaveBeenCalled();
      expect(result.id).toBe('new-key-id');
      expect(result.publicKey).toMatch(/^pk_payin_/);
      expect(result.secretKey).toMatch(/^sk_payin_/);
      expect(result.direction).toBe(DirectionType.PAYIN);
    });
  });
});

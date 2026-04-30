import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TraderWalletsService } from './trader-wallets.service';
import type { PrismaService } from '../../config/prisma.service';
import type { HashicorpVaultService } from './hashicorp-vault.service';

describe('TraderWalletsService', () => {
  it('rejects generation when Vault is not configured', async () => {
    const prisma = {
      traderProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'tp-1' }) },
      traderWallet: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const vault = { isConfigured: () => false } as unknown as HashicorpVaultService;
    const svc = new TraderWalletsService(prisma, vault);
    await expect(svc.generateForTrader('tp-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when trader profile is missing', async () => {
    const prisma = {
      traderProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      traderWallet: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const vault = { isConfigured: () => true } as unknown as HashicorpVaultService;
    const svc = new TraderWalletsService(prisma, vault);
    await expect(svc.generateForTrader('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 when wallet row already exists', async () => {
    const prisma = {
      traderProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'tp-1' }) },
      traderWallet: {
        findUnique: jest.fn().mockResolvedValue({ traderId: 'tp-1', address: 'TTEST' }),
      },
    } as unknown as PrismaService;
    const vault = { isConfigured: () => true } as unknown as HashicorpVaultService;
    const svc = new TraderWalletsService(prisma, vault);
    await expect(svc.generateForTrader('tp-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { PrismaService } from '../../config/prisma.service';
import { HashicorpVaultService } from './hashicorp-vault.service';
import { deriveTronAddressFromMnemonic } from './tron-bip44.util';

@Injectable()
export class TraderWalletsService {
  private readonly logger = new Logger(TraderWalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: HashicorpVaultService,
  ) {}

  private async withVaultRedisLock<T>(fn: () => Promise<T>): Promise<T> {
    const redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 2,
    });
    const key = config.vault.deriveLockKey;
    const ttl = Math.max(5, config.vault.deriveLockTtlSec);
    const ok = await redis.set(key, '1', 'EX', ttl, 'NX');
    if (ok !== 'OK') {
      await redis.quit();
      throw new ConflictException('Wallet derivation already in progress; retry shortly');
    }
    try {
      return await fn();
    } finally {
      await redis.del(key).catch(() => undefined);
      await redis.quit();
    }
  }

  async generateForTrader(traderId: string): Promise<{
    trader_id: string;
    address: string;
    derivation_index: number;
  }> {
    const trader = await this.prisma.traderProfile.findUnique({ where: { id: traderId } });
    if (!trader) {
      throw new NotFoundException('Trader not found');
    }

    const existing = await this.prisma.traderWallet.findUnique({ where: { traderId } });
    if (existing) {
      throw new ConflictException('Deposit wallet already exists for this trader');
    }

    if (!this.vault.isConfigured()) {
      throw new BadRequestException('Vault is not configured for custodial wallets');
    }

    return this.withVaultRedisLock(async () => {
      const index = await this.vault.consumeNextDerivationIndex();
      const mnemonic = await this.vault.readMasterSeed();
      const { address, privateKeyHex } = deriveTronAddressFromMnemonic(mnemonic, index);
      const vaultPath = `${config.vault.kvMount.trim()}/data/${config.vault.walletPrefixPath.trim()}/${traderId}`;

      await this.vault.writeTraderWalletSecrets(traderId, {
        private_key: privateKeyHex,
        address,
        index,
      });

      try {
        await this.vault.upsertTronSecpSignerAccountWallet(traderId, privateKeyHex);
      } catch (e) {
        this.logger.warn(`Vault TRON signer engine rejected key registration trader=${traderId}: ${e}`);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.traderWallet.create({
          data: {
            traderId,
            address,
            derivationIndex: index,
            vaultPath,
          },
        });
        await tx.traderProfile.update({
          where: { id: traderId },
          data: { usdtTrc20DepositAddress: address },
        });
      });

      this.logger.log(`Custodial TRC-20 deposit address created trader=${traderId} index=${index}`);

      return { trader_id: traderId, address, derivation_index: index };
    });
  }

  async getForTrader(traderId: string): Promise<{
    trader_id: string;
    address: string;
    derivation_index: number;
    created_at: string;
  }> {
    const row = await this.prisma.traderWallet.findUnique({ where: { traderId } });
    if (!row) {
      throw new NotFoundException('Trader wallet not found');
    }
    return {
      trader_id: row.traderId,
      address: row.address,
      derivation_index: row.derivationIndex,
      created_at: row.createdAt.toISOString(),
    };
  }

  /**
   * Best-effort: used when a new trader profile is created. Skips when Vault is off or row exists.
   */
  async ensureProvisioned(traderId: string): Promise<void> {
    if (!this.vault.isConfigured() || !config.wallet.autoProvisionTronOnTraderCreate) {
      return;
    }
    const existing = await this.prisma.traderWallet.findUnique({ where: { traderId } });
    if (existing) return;
    try {
      await this.generateForTrader(traderId);
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.warn(`Custodial wallet auto-provision failed trader=${traderId}: ${e}`);
    }
  }
}

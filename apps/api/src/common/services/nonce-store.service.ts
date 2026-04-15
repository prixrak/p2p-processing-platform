import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import { NONCE_VALIDITY_SECONDS } from '@p2p/shared';

@Injectable()
export class NonceStoreService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  onModuleInit() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      keyPrefix: 'nonce:',
    });
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    const exists = await this.redis.exists(nonce);
    return exists === 1;
  }

  async markNonceUsed(nonce: string): Promise<void> {
    await this.redis.set(nonce, '1', 'EX', NONCE_VALIDITY_SECONDS * 2);
  }
}

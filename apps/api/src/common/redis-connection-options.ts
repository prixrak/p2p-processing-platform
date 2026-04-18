import type { RedisOptions } from 'ioredis';
import { config } from '@p2p/config';

/** Shared ioredis client settings for pub/sub and SSE resilience. */
export function createRedisConnectionOptions(): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    retryStrategy(times: number): number {
      return Math.min(times * 200, 8000);
    },
  };
}

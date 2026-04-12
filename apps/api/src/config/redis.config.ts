import { config } from '@p2p/config';

export const REDIS_CONNECTION = {
  host: config.redis.host,
  port: config.redis.port,
} as const;

export const bullMqConfig = {
  connection: REDIS_CONNECTION,
};

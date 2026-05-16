import { createRedisConnectionOptions } from '../common/redis-connection-options';

/** BullMQ/IORedis connection (shared with ad-hoc Redis clients). */
export const bullMqConfig = {
  connection: createRedisConnectionOptions(),
};

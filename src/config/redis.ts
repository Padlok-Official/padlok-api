import IORedis, { type RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '@/utils/logger';

const baseOptions: RedisOptions = {
  // BullMQ requires this to be null, but since we only use this client for
  // caching/rate limiting and spawn separate clients for BullMQ, we keep it
  // finite here so commands fail fast when Redis is unreachable.
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => (times > 10 ? null : Math.min(times * 500, 10_000)),
  reconnectOnError: (err) => err.message.includes('READONLY'),
  lazyConnect: false,
};

/**
 * Primary Redis connection — used for caching, sessions, rate limiting.
 * Separate pub/sub clients are created on demand (Socket.io adapter, BullMQ).
 */
export const redis = new IORedis(env.redis.url, baseOptions);

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

/**
 * Create a fresh duplicate connection — required by BullMQ workers and
 * the Socket.io Redis adapter, each of which need their own client.
 */
export const createRedisClient = (): IORedis =>
  new IORedis(env.redis.url, baseOptions);

export const pingRedis = async (): Promise<boolean> => {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.error({ err }, 'Redis ping failed');
    return false;
  }
};

export const closeRedis = async (): Promise<void> => {
  redis.disconnect();
  logger.info('Redis disconnected');
};

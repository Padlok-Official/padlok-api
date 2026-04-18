/**
 * Common Jest mocks for DB/Redis-dependent modules so integration tests
 * can exercise route→controller→service→model wiring without infrastructure.
 *
 * Usage:
 *   jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);
 *   jest.mock('@/config/redis', () => require('../helpers/mockDeps').redisMock);
 */

export const dbMock = {
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
  pingDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(undefined),
};

const redisStore = new Map<string, { value: string; expiresAt?: number }>();

export const redisMock = {
  redis: {
    get: jest.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, { value });
      return 'OK';
    }),
    setex: jest.fn(async (key: string, seconds: number, value: string) => {
      redisStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn().mockResolvedValue(null),
    on: jest.fn(),
    disconnect: jest.fn(),
  },
  createRedisClient: jest.fn(),
  pingRedis: jest.fn().mockResolvedValue(true),
  closeRedis: jest.fn().mockResolvedValue(undefined),
};

// Expose the in-memory store so individual tests can seed or inspect it
export const getRedisStore = () => redisStore;
export const clearRedisStore = () => redisStore.clear();

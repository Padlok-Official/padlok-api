import rateLimit, { type Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '@/config/redis';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { fail } from '@/utils/respond';

const redisStore = (prefix: string) =>
  new RedisStore({
    prefix,
    // ioredis sendCommand signature
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<never>,
  });

interface BuildLimiterOpts {
  prefix: string;
  overrides?: Partial<Options>;
}

const buildLimiter = ({ prefix, overrides = {} }: BuildLimiterOpts) => {
  // In the test environment, use the default (in-memory) store to avoid
  // a hard Redis dependency in unit/integration tests.
  const useMemory = env.nodeEnv === 'test';
  return rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit: env.rateLimit.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(useMemory ? {} : { store: redisStore(prefix) }),
    // Stacking limiters on the same route (general + auth) trips v7's
    // "double count per request" validator. Per-limiter Redis prefixes keep
    // counts independent; we disable the cross-limiter sanity check too.
    validate: { singleCount: false },
    skip: () => false,
    handler: (_req, res) => fail(res, 429, 'Too many requests, please slow down'),
    requestWasSuccessful: (_req, res) => res.statusCode < 500,
    ...overrides,
  });
};

// express-rate-limit default behavior: if the store throws, it emits an
// error. We want to log and let the request through rather than 500.
const safeLimiter = (limiter: ReturnType<typeof rateLimit>) => {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    limiter(req, res, (err) => {
      if (err) {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'Rate limiter error — allowing request through');
        return next();
      }
      next();
    });
  };
};

/** General API-wide limit: 1000 req / 15 min per IP. */
export const generalLimiter = safeLimiter(buildLimiter({ prefix: 'rl:general:' }));

/** Stricter limit for auth endpoints: 15 req / 15 min per IP. */
export const authLimiter = safeLimiter(
  buildLimiter({
    prefix: 'rl:auth:',
    overrides: {
      limit: 15,
      windowMs: 15 * 60 * 1000,
      handler: (_req, res) =>
        fail(res, 429, 'Too many authentication attempts, please try again later'),
    },
  }),
);

import rateLimit, { type Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '@/config/redis';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { fail } from '@/utils/respond';

const redisStore = () =>
  new RedisStore({
    // ioredis sendCommand signature
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<never>,
  });

const buildLimiter = (overrides: Partial<Options> = {}) =>
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit: env.rateLimit.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: redisStore(),
    // Allow requests through when the store errors (Redis outage) so the API
    // stays available. Errors are logged for observability.
    skip: () => false,
    handler: (_req, res) => fail(res, 429, 'Too many requests, please slow down'),
    requestWasSuccessful: (_req, res) => res.statusCode < 500,
    ...overrides,
  });

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
export const generalLimiter = safeLimiter(buildLimiter());

/** Stricter limit for auth endpoints: 15 req / 15 min per IP. */
export const authLimiter = safeLimiter(
  buildLimiter({
    limit: 15,
    windowMs: 15 * 60 * 1000,
    handler: (_req, res) =>
      fail(res, 429, 'Too many authentication attempts, please try again later'),
  }),
);

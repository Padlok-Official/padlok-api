import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { pingDatabase } from '@/config/database';
import { pingRedis } from '@/config/redis';
import { generalLimiter } from '@/middleware/security';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { ok, fail } from '@/utils/respond';
import authRoutes from '@/features/auth/authRoutes';
import analyticsRoutes from '@/features/analytics/analyticsRoutes';
import roleRoutes from '@/features/role/roleRoutes';
import permissionRoutes from '@/features/role/permissionRoutes';

export const createApp = (): Application => {
  const app = express();

  // Trust the first proxy (Heroku, Fly, etc.) so rate limiters see the real IP.
  app.set('trust proxy', 1);

  // Security + perf
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Request logging
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Rate limit all /api routes
  app.use(env.apiPrefix, generalLimiter);

  // Health check (mounted before routes so it doesn't hit rate limiter on /api)
  app.get('/health', async (_req: Request, res: Response) => {
    const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);
    const ready = dbOk && redisOk;
    return ready
      ? ok(res, { database: 'ok', redis: 'ok' }, 'Healthy')
      : fail(res, 503, 'Service degraded', {
          database: dbOk ? 'ok' : 'down',
          redis: redisOk ? 'ok' : 'down',
        });
  });

  app.get(`${env.apiPrefix}/health`, async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);
    const ready = dbOk && redisOk;
    return ready
      ? ok(res, { database: 'ok', redis: 'ok' }, 'Healthy')
      : fail(res, 503, 'Service degraded', {
          database: dbOk ? 'ok' : 'down',
          redis: redisOk ? 'ok' : 'down',
        });
  });

  // Feature routes
  app.use(`${env.apiPrefix}/auth`, authRoutes);
  app.use(`${env.apiPrefix}/analytics`, analyticsRoutes);
  app.use(`${env.apiPrefix}/roles`, roleRoutes);
  app.use(`${env.apiPrefix}/permissions`, permissionRoutes);
  // Upcoming:
  //   app.use(`${env.apiPrefix}/admins`, adminRoutes);
  //   app.use(`${env.apiPrefix}/disputes`, disputeRoutes);
  //   app.use(`${env.apiPrefix}/flags`, flagRoutes);
  //   app.use(`${env.apiPrefix}/notifications`, notificationRoutes);

  // 404 + error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

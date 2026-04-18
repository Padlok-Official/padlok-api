import http from 'http';
import { createApp } from './app';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { closeDatabase } from '@/config/database';
import { closeRedis } from '@/config/redis';

const GRACEFUL_SHUTDOWN_TIMEOUT = 15_000;

const startServer = async () => {
  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.port, () => {
    logger.info(
      `🚀 PadLok API listening on http://localhost:${env.port}${env.apiPrefix} (${env.nodeEnv})`,
    );
    logger.info(`   Health check: http://localhost:${env.port}/health`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);

    server.close(async () => {
      try {
        await closeDatabase();
        await closeRedis();
        clearTimeout(timer);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
};

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

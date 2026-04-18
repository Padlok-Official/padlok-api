import pino from 'pino';
import { env } from '@/config/env';

export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  transport: env.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
  base: { service: 'padlok-api' },
});

export type Logger = typeof logger;

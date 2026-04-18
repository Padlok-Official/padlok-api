import pino from 'pino';
import { env } from '@/config/env';

const isTest = env.nodeEnv === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.isProd ? 'info' : isTest ? 'silent' : 'debug'),
  transport:
    env.isProd || isTest
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

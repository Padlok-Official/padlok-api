import { Pool, type PoolConfig } from 'pg';
import { env } from './env';
import { logger } from '@/utils/logger';

const buildConfig = (): PoolConfig => {
  const shared: Partial<PoolConfig> = {
    max: env.db.poolMax,
    idleTimeoutMillis: env.db.idleTimeoutMs,
    connectionTimeoutMillis: 10_000,
  };

  if (env.db.url) {
    return {
      connectionString: env.db.url,
      ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
      ...shared,
    };
  }

  return {
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
    ...shared,
  };
};

export const pool = new Pool(buildConfig());

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export const pingDatabase = async (): Promise<boolean> => {
  try {
    const { rows } = await pool.query('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch (err) {
    logger.error({ err }, 'Database ping failed');
    return false;
  }
};

export const closeDatabase = async (): Promise<void> => {
  await pool.end();
  logger.info('PostgreSQL pool closed');
};

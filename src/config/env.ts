import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const required = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env variable: ${key}`);
  }
  return value;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] && process.env[key]!.trim() !== '' ? process.env[key]! : fallback;

const toNumber = (value: string, fallback: number): number => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
  port: toNumber(optional('PORT', '4000'), 4000),
  apiPrefix: optional('API_PREFIX', '/api/v1'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    url: process.env.DATABASE_URL,
    host: optional('DB_HOST', 'localhost'),
    port: toNumber(optional('DB_PORT', '5432'), 5432),
    name: optional('DB_NAME', 'padlok'),
    user: optional('DB_USER', 'postgres'),
    password: optional('DB_PASSWORD', ''),
    ssl: toBool(process.env.DB_SSL, false),
    poolMax: toNumber(optional('DB_POOL_MAX', '40'), 40),
    idleTimeoutMs: toNumber(optional('DB_IDLE_TIMEOUT_MS', '30000'), 30000),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-me'),
    expiresIn: optional('JWT_EXPIRES_IN', '1d'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  rateLimit: {
    windowMs: toNumber(optional('RATE_LIMIT_WINDOW_MS', '900000'), 900000),
    maxRequests: toNumber(optional('RATE_LIMIT_MAX_REQUESTS', '1000'), 1000),
  },

  email: {
    brevoApiKey: process.env.BREVO_API_KEY ?? '',
    senderEmail: optional('BREVO_SENDER_EMAIL', 'no-reply@padlok.com'),
    senderName: optional('BREVO_SENDER_NAME', 'PadLok Admin'),
  },

  dashboardUrl: optional('DASHBOARD_URL', 'http://localhost:5173'),
};

// Re-export `required` in case a feature needs to hard-require a var at runtime
export { required };

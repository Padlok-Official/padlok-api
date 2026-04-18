/**
 * Jest global setup — runs before each test file imports any app code.
 * Sets sensible defaults for env vars so modules that read env at import
 * time (config/env.ts) don't fail, and quiets the logger in tests.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.PORT = '0';
process.env.REDIS_URL = 'redis://localhost:6379/15'; // use DB 15 for tests
// Silence pino during tests (override --verbose at runtime)
process.env.LOG_LEVEL = 'silent';

// Default DATABASE_URL only if not already set (CI can override)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/padlok_test';
}

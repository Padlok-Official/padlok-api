/**
 * Migration runner for the admin/dashboard side of PadLok.
 *
 * - Reads .sql files from src/database/migrations/ (sorted by filename)
 * - Splits each file on a `-- DOWN` marker; the portion before is the "up" SQL
 * - Tracks applied migrations in `admin_migrations` (namespaced so it doesn't
 *   collide with migration tables from the existing client-side backend)
 * - Each migration is wrapped in a transaction — if any statement fails,
 *   the whole file rolls back and the runner stops
 *
 * Usage: `npm run migrate`
 */

import fs from 'fs';
import path from 'path';
import { pool, closeDatabase } from '@/config/database';
import { logger } from '@/utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATIONS_TABLE = 'admin_migrations';

interface MigrationFile {
  id: string; // e.g. "001_create_admin_roles"
  filename: string; // e.g. "001_create_admin_roles.sql"
  upSql: string;
  downSql: string;
}

const ensureMigrationsTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const getAppliedMigrations = async (): Promise<Set<string>> => {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`,
  );
  return new Set(rows.map((r) => r.id));
};

const splitUpDown = (content: string): { up: string; down: string } => {
  const marker = /^\s*--\s*DOWN\s*$/im;
  const match = content.match(marker);
  if (!match || match.index === undefined) {
    return { up: content.trim(), down: '' };
  }
  return {
    up: content.slice(0, match.index).trim(),
    down: content.slice(match.index + match[0].length).trim(),
  };
};

export const loadMigrations = (): MigrationFile[] => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const { up, down } = splitUpDown(content);
    return {
      id: filename.replace(/\.sql$/, ''),
      filename,
      upSql: up,
      downSql: down,
    };
  });
};

const applyMigration = async (migration: MigrationFile): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration.upSql);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [
      migration.id,
    ]);
    await client.query('COMMIT');
    logger.info(`✓ Applied ${migration.filename}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err, migration: migration.filename }, '✗ Migration failed');
    throw err;
  } finally {
    client.release();
  }
};

const run = async (): Promise<void> => {
  logger.info('Running admin migrations...');
  await ensureMigrationsTable();

  const all = loadMigrations();
  const applied = await getAppliedMigrations();
  const pending = all.filter((m) => !applied.has(m.id));

  if (pending.length === 0) {
    logger.info('✓ No pending migrations');
    return;
  }

  logger.info(`Found ${pending.length} pending migration(s)`);
  for (const migration of pending) {
    await applyMigration(migration);
  }
  logger.info(`✓ Applied ${pending.length} migration(s) successfully`);
};

run()
  .catch((err) => {
    logger.error({ err }, 'Migration run failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

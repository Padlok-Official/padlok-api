/**
 * Rollback runner — reverts the most recently applied admin migration.
 *
 * Reads the `-- DOWN` section of the migration file and executes it in a
 * single transaction, then removes the row from admin_migrations.
 *
 * Usage:
 *   npm run migrate:down          # rolls back the last one
 *   npm run migrate:down -- --all # rolls back everything (use with care)
 *   npm run migrate:down -- 3     # rolls back the last 3
 */

import { pool, closeDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import { loadMigrations } from './runMigrations';

const MIGRATIONS_TABLE = 'admin_migrations';

const getAppliedMigrationIds = async (): Promise<string[]> => {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY applied_at DESC, id DESC`,
  );
  return rows.map((r) => r.id);
};

const rollbackMigration = async (id: string, downSql: string): Promise<void> => {
  if (!downSql || downSql.trim() === '') {
    logger.warn(`⚠ ${id} has no DOWN block — removing from tracking only`);
    await pool.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [id]);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(downSql);
    await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [id]);
    await client.query('COMMIT');
    logger.info(`✓ Rolled back ${id}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err, migration: id }, '✗ Rollback failed');
    throw err;
  } finally {
    client.release();
  }
};

const parseCount = (): number | 'all' => {
  const args = process.argv.slice(2);
  if (args.includes('--all')) return 'all';
  const numArg = args.find((a) => /^\d+$/.test(a));
  return numArg ? parseInt(numArg, 10) : 1;
};

const run = async (): Promise<void> => {
  const count = parseCount();
  logger.info(`Rolling back ${count === 'all' ? 'ALL' : count} migration(s)...`);

  const applied = await getAppliedMigrationIds();
  if (applied.length === 0) {
    logger.info('No migrations to roll back');
    return;
  }

  const toRollback =
    count === 'all' ? applied : applied.slice(0, Math.min(count, applied.length));

  const all = loadMigrations();
  const byId = new Map(all.map((m) => [m.id, m]));

  for (const id of toRollback) {
    const migration = byId.get(id);
    if (!migration) {
      logger.warn(`⚠ Migration file for "${id}" not found — removing from tracking`);
      await pool.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [id]);
      continue;
    }
    await rollbackMigration(id, migration.downSql);
  }

  logger.info(`✓ Rollback complete`);
};

run()
  .catch((err) => {
    logger.error({ err }, 'Rollback failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

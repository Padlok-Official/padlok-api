import type { PoolClient } from 'pg';
import { pool } from '@/config/database';

/**
 * Run a sequence of SQL operations in a single BEGIN/COMMIT transaction.
 * Automatically rolls back if the callback throws.
 *
 *   const user = await withTransaction(async (client) => {
 *     const { rows } = await client.query('INSERT ...');
 *     await client.query('INSERT ...');
 *     return rows[0];
 *   });
 */
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://slotbook:slotbook@localhost:5432/slotbook';

export const pool = new pg.Pool({
  connectionString,
  max: 25,
});

export const db = drizzle(pool, { schema });

/**
 * Runs a function inside a PostgreSQL transaction with a transaction-scoped
 * advisory lock (`pg_advisory_xact_lock`) keyed to the host.
 * Also performs lazy expiration of any stale holds using Postgres `NOW()`.
 */
export async function withHostTransactionLock<T>(
  hostId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`host:${hostId}`]);
    await client.query(
      `UPDATE bookings
       SET status = 'expired', updated_at = NOW()
       WHERE host_id = $1 AND status = 'held' AND hold_expires_at <= NOW()`,
      [hostId]
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

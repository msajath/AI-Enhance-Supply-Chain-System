import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client pool', { error: err.message });
});

/**
 * Execute a parameterized SQL query safely
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  const start = Date.now();
  try {
    const res = await pool.query<R>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, durationMs: duration, rows: res.rowCount });
    return res;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Database query execution error', { text, error: error.message });
    throw error;
  }
}

/**
 * Execute operations within an atomic database transaction
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back due to error', { error: (err as Error).message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check whether PostgreSQL database connection is alive
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await pool.query('SELECT 1 AS health_check');
    const latencyMs = Date.now() - start;
    if (res.rows.length > 0) {
      return { connected: true, latencyMs };
    }
    return { connected: false, error: 'Empty query result' };
  } catch (err: unknown) {
    const error = err as Error;
    return { connected: false, error: error.message };
  }
}

/**
 * Close pool gracefully on shutdown
 */
export async function closeDatabasePool(): Promise<void> {
  try {
    await pool.end();
    logger.info('PostgreSQL pool closed successfully');
  } catch (err) {
    logger.error('Error closing PostgreSQL pool', { error: (err as Error).message });
  }
}

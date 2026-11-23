
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const planOnly = process.argv.includes('--plan');
const executeRequested = process.argv.includes('--execute');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'qorvenz_user',
  password: process.env.DB_PASSWORD || 'qorvenz_dev_secret_2026',
  database: process.env.DB_NAME || 'qorvenz_db',
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

async function rollback() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Automatic rollback is disabled in production. Use the approved recovery procedure.',
    );
  }

  if (!planOnly) {
    if (
      !executeRequested ||
      process.env.DB_ROLLBACK_CONFIRM !== 'YES_I_HAVE_A_BACKUP'
    ) {
      throw new Error(
        'Rollback execution blocked. First review --plan and the recovery guide. ' +
        'Execution requires --execute and explicit backup confirmation.',
      );
    }
  }

  await client.connect();

  try {
    // Use insertion history rather than filename ordering.
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1',
    );

    const version: string | undefined = rows[0]?.version;

    if (!version) {
      console.log('No applied migrations to roll back.');
      return;
    }

    const downFile = path.resolve(
      __dirname,
      '../database/migrations/down',
      version,
    );

    console.log(`Latest applied migration: ${version}`);

    if (!fs.existsSync(downFile)) {
      throw new Error(
        `Rollback unavailable: missing down migration for ${version}. ` +
        'Do not invent a reverse migration. Follow the recovery guide.',
      );
    }

    const sql = fs.readFileSync(downFile, 'utf8');

    if (!sql.trim()) {
      throw new Error(`Down migration is empty: ${version}`);
    }

    if (planOnly) {
      console.log(`Down migration found: ${downFile}`);
      console.log('PLAN ONLY: No SQL statements executed.');
      console.log(
        'Warning: file existence does not prove that rollback is safe or lossless.',
      );
      return;
    }

    console.log(`Executing reviewed rollback: ${version}`);

    await client.query('BEGIN');

    try {
      await client.query(sql);

      await client.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version],
      );

      await client.query('COMMIT');

      console.log(`Rolled back ${version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

rollback().catch((error) => {
  console.error(
    'Rollback blocked or failed:',
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});

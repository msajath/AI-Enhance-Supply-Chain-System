import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Rolls back ONLY the newest applied migration using database/migrations/down/<same file name>.
// Usage: npm run db:rollback            (asks for nothing; refuses in production)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'qorvenz_user',
  password: process.env.DB_PASSWORD || 'qorvenz_dev_secret_2026',
  database: process.env.DB_NAME || 'qorvenz_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function rollback() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to roll back in production.');
    process.exit(1);
  }
  await client.connect();
  try {
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
    const version: string | undefined = rows[0]?.version;
    if (!version) {
      console.log('No applied migrations to roll back.');
      return;
    }
    const downFile = path.resolve(__dirname, '../database/migrations/down', version);
    if (!fs.existsSync(downFile)) {
      throw new Error(`No down migration found for ${version} (expected ${downFile})`);
    }
    console.log(`▶ Rolling back ${version}...`);
    await client.query('BEGIN');
    try {
      await client.query(fs.readFileSync(downFile, 'utf-8'));
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
      await client.query('COMMIT');
      console.log(`✓ Rolled back ${version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

rollback().catch((err) => {
  console.error('✕ Rollback failed:', err);
  process.exit(1);
});

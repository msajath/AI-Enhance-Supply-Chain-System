import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Load root .env
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

async function runMigrations() {
  console.log('--- [QORVENZ MIGRATION RUNNER] ---');
  console.log(`Connecting to PostgreSQL at ${client.host}:${client.port}/${client.database} as ${client.user}...`);

  try {
    await client.connect();
    console.log('✓ Successfully connected to PostgreSQL.');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Fetch applied migrations
    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // Read migrations directory
    const migrationsDir = path.resolve(__dirname, '../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found: ${migrationsDir}`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      await client.end();
      return;
    }

    let appliedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`- Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`▶ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ Migration applied successfully: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✕ Error applying migration ${file}:`, err);
        throw err;
      }
    }

    console.log(`==============================================`);
    console.log(`Migration complete. Newly applied: ${appliedCount}, Total checked: ${files.length}`);
    console.log(`==============================================`);
  } catch (error) {
    console.error('Fatal migration failure:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

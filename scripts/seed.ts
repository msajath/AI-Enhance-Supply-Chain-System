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

async function runSeeds() {
  console.log('--- [QORVENZ SEED RUNNER] ---');
  console.log(`Connecting to PostgreSQL at ${client.host}:${client.port}/${client.database}...`);

  try {
    await client.connect();
    console.log('✓ Successfully connected to PostgreSQL.');

    const seedsDir = path.resolve(__dirname, '../database/seeds');
    if (!fs.existsSync(seedsDir)) {
      console.log('No seeds directory found.');
      await client.end();
      return;
    }

    const files = fs
      .readdirSync(seedsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`▶ Executing seed file: ${file}...`);
      const filePath = path.join(seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`✓ Seed script executed: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✕ Error executing seed ${file}:`, err);
        throw err;
      }
    }

    console.log('All seed data executed successfully.');
  } catch (error) {
    console.error('Fatal seed failure:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeeds();

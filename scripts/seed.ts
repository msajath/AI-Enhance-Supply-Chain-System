import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { compare, hash } from 'bcryptjs';
import dotenv from 'dotenv';

// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5434', 10),
  user: process.env.DB_USER || 'qorvenz_user',
  password: process.env.DB_PASSWORD || 'qorvenz_dev_secret_2026',
  database: process.env.DB_NAME || 'qorvenz_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const ORG_CODE = 'QOR-HQ-01';
// The password that 001_sprint1_seed.sql used to give everyone. Accounts still using it are rotated.
const LEGACY_SHARED_PASSWORD = 'Password123!';
const LEGACY_ACCOUNTS = ['admin@qorvenz.local'];

/**
 * Demo users (AESCS-161), following the Sprint 1 fixture plan
 * (docs/sprint-01/09-demo-fixtures-and-data-governance.md §1, synthetic `.test` e-mails).
 * Only users whose role exists in the code today are created; exec, procurement, logistics,
 * fleet, site engineers, finance and auditor follow once their roles are added (Q-402).
 *
 * Each user gets their OWN password:
 *   - from the env var named in `passwordEnv` if you set one (handy for your own laptop), or
 *   - a random 16-character password generated on first seed and printed once.
 * Re-running the seed never changes an existing user's password.
 */
const seedUsers: ReadonlyArray<{
  email: string;
  fullName: string;
  role: 'ADMIN' | 'WAREHOUSE_MANAGER' | 'DRIVER';
  projects: string[];
  warehouses: string[];
  passwordEnv: string;
}> = [
  { email: 'admin@demo.qorvenz.test', fullName: 'Demo Administrator', role: 'ADMIN', projects: [], warehouses: [], passwordEnv: 'SEED_PASSWORD_ADMIN' },
  // Central warehouse serves both projects.
  { email: 'warehouse.cen@demo.qorvenz.test', fullName: 'Central Warehouse Manager', role: 'WAREHOUSE_MANAGER', projects: ['PRJ-GAL', 'PRJ-MAT'], warehouses: ['WH-CENTRAL-01'], passwordEnv: 'SEED_PASSWORD_WAREHOUSE_CEN' },
  // Plan: "storekeeper.mat → WH-MAT only. This proves cross-project denial".
  // Uses WAREHOUSE_MANAGER until a STOREKEEPER role exists (Q-402).
  { email: 'storekeeper.mat@demo.qorvenz.test', fullName: 'Matara Site Storekeeper', role: 'WAREHOUSE_MANAGER', projects: ['PRJ-MAT'], warehouses: ['WH-MAT'], passwordEnv: 'SEED_PASSWORD_STOREKEEPER_MAT' },
  { email: 'driver.1@demo.qorvenz.test', fullName: 'Driver One', role: 'DRIVER', projects: [], warehouses: [], passwordEnv: 'SEED_PASSWORD_DRIVER_1' },
  { email: 'driver.2@demo.qorvenz.test', fullName: 'Driver Two', role: 'DRIVER', projects: [], warehouses: [], passwordEnv: 'SEED_PASSWORD_DRIVER_2' },
];

function generatePassword(): string {
  // 16 URL-safe characters, ~96 bits of entropy
  return randomBytes(12).toString('base64url');
}

async function runSqlSeeds() {
  const seedsDir = path.resolve(__dirname, '../database/seeds');
  if (!fs.existsSync(seedsDir)) {
    console.log('No seeds directory found.');
    return;
  }
  const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log(`▶ Executing seed file: ${file}...`);
    await client.query(fs.readFileSync(path.join(seedsDir, file), 'utf-8'));
    console.log(`✓ Seed script executed: ${file}`);
  }
}

async function runUserSeeds(): Promise<string[]> {
  const credentials: string[] = [];
  const org = await client.query<{ id: string }>('SELECT id FROM organizations WHERE code = $1', [ORG_CODE]);
  const organizationId = org.rows[0]?.id;
  if (!organizationId) throw new Error(`Seed organization ${ORG_CODE} is missing`);

  for (const user of seedUsers) {
    const fromEnv = process.env[user.passwordEnv];
    const label = (password: string) => (fromEnv ? `(password from ${user.passwordEnv})` : password);
    const existing = await client.query<{ id: string; password_hash: string; organization_id: string | null }>(
      'SELECT id, password_hash, organization_id FROM users WHERE lower(email) = lower($1)',
      [user.email]
    );
    let userId = existing.rows[0]?.id;

    if (!userId) {
      const password = fromEnv || generatePassword();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (organization_id, email, password_hash, full_name, role)
         VALUES ($1, lower($2), $3, $4, $5) RETURNING id`,
        [organizationId, user.email, await hash(password, 12), user.fullName, user.role]
      );
      userId = inserted.rows[0].id;
      credentials.push(`${user.email.padEnd(34)} ${user.role.padEnd(18)} ${label(password)}`);
    } else {
      // Attach to the demo company if the account predates the organisation link.
      if (!existing.rows[0].organization_id) {
        await client.query('UPDATE users SET organization_id = $1 WHERE id = $2', [organizationId, userId]);
      }
    }

    // Project and warehouse grants are keyed on codes, so re-runs add nothing new.
    await client.query(
      `INSERT INTO user_project_access (user_id, project_id, organization_id)
       SELECT $1, p.id, p.organization_id FROM projects p
       WHERE p.organization_id = $2 AND p.code = ANY($3::text[])
       ON CONFLICT (user_id, project_id) DO NOTHING`,
      [userId, organizationId, user.projects]
    );
    await client.query(
      `INSERT INTO user_warehouse_access (user_id, warehouse_id, organization_id)
       SELECT $1, w.id, w.organization_id FROM warehouses w
       WHERE w.organization_id = $2 AND w.code = ANY($3::text[])
       ON CONFLICT (user_id, warehouse_id) DO NOTHING`,
      [userId, organizationId, user.warehouses]
    );
  }
  // Old 001 seed gave admin@qorvenz.local a password published in the repo. Disable any
  // account that still uses it; admin@demo.qorvenz.test replaces it.
  for (const email of LEGACY_ACCOUNTS) {
    const legacy = await client.query<{ id: string; password_hash: string; is_active: boolean }>(
      'SELECT id, password_hash, is_active FROM users WHERE lower(email) = lower($1)', [email]
    );
    const row = legacy.rows[0];
    if (row?.is_active && (await compare(LEGACY_SHARED_PASSWORD, row.password_hash))) {
      await client.query('UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
      credentials.push(`${email.padEnd(34)} DISABLED (used the old shared password; sign in as admin@demo.qorvenz.test)`);
    }
  }
  return credentials;
}

async function runSeeds() {
  console.log('--- [QORVENZ SEED RUNNER] ---');
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data in production.');
    process.exit(1);
  }
  console.log(`Connecting to PostgreSQL at ${client.host}:${client.port}/${client.database}...`);

  try {
    await client.connect();
    console.log('✓ Successfully connected to PostgreSQL.');
    await client.query('BEGIN');
    try {
      await runSqlSeeds();
      const credentials = await runUserSeeds();
      await client.query('COMMIT');
      if (credentials.length > 0) {
        console.log('\n=== New local login credentials (shown ONCE: save them in your password manager) ===');
        credentials.forEach((line) => console.log(`  ${line}`));
        console.log('=== Do not commit or share these. Each team member seeds their own database. ===\n');
      } else {
        console.log('✓ Users already exist; passwords unchanged.');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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

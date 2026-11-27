// Explicit local-only provisioning. Does not run the general seed runner.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { hash, compare } from 'bcryptjs';
import { Client } from 'pg';
import dotenv from 'dotenv';
import accounts from '../frontend/src/demoRoles.json';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== 'localhost' ||
      process.env.DB_PORT !== '5434' || process.env.DB_NAME !== 'qorvenz_db') {
    throw new Error('Requires the approved local development database on localhost:5434.');
  }
  const directory = path.join(os.homedir(), 'Qorvenz_Private_Demo');
  if (!fs.existsSync(directory)) throw new Error('Create the private credential directory with restricted permissions first.');
  const filename = path.join(directory, 'accounts.json');
  const passwords: Record<string, string> = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
  if (fs.existsSync(filename) && accounts.some(account => typeof passwords[account.email] !== 'string' || !passwords[account.email])) {
    throw new Error('Existing credential file is incomplete; refusing to overwrite it.');
  }
  for (const account of accounts) passwords[account.email] ||= randomBytes(18).toString('base64url');
  if (!fs.existsSync(filename)) fs.writeFileSync(filename, JSON.stringify(passwords), { flag: 'wx', mode: 0o600 });
  const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await client.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query('SELECT current_database() AS name')).rows[0].name !== 'qorvenz_db') throw new Error('Database identity mismatch.');
    const organization = (await client.query("SELECT id FROM organizations WHERE code='QOR-HQ-01'")).rows[0];
    if (!organization) throw new Error('Expected demo organization is missing.');
    for (const account of accounts) {
      const existing = (await client.query('SELECT role, organization_id, password_hash FROM users WHERE lower(email)=lower($1)', [account.email])).rows[0];
      if (existing) {
        if (existing.role !== account.code || existing.organization_id !== organization.id ||
            !await compare(passwords[account.email], existing.password_hash)) throw new Error('Existing demo account differs; refusing to change it.');
        continue;
      }
      const user = (await client.query('INSERT INTO users (organization_id,email,password_hash,full_name,role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [organization.id, account.email, await hash(passwords[account.email], 12), 'Demo ' + account.role, account.code])).rows[0];
      if (account.projectAccess) {
        await client.query(`INSERT INTO user_project_access(user_id,project_id,organization_id)
          SELECT $1,id,organization_id FROM projects WHERE organization_id=$2 AND code=ANY($3::text[])`, [user.id, organization.id, ['PRJ-GAL','PRJ-MAT']]);
        await client.query(`INSERT INTO user_site_access(user_id,site_id,organization_id)
          SELECT $1,s.id,s.organization_id FROM sites s JOIN user_project_access p ON p.project_id=s.project_id WHERE p.user_id=$1`, [user.id]);
      }
      if (account.code === 'SITE_STOREKEEPER') await client.query(`INSERT INTO user_warehouse_access(user_id,warehouse_id,organization_id)
        SELECT $1,id,organization_id FROM warehouses WHERE organization_id=$2 AND code='WH-MAT'`, [user.id,organization.id]);
    }
    await client.query('COMMIT');
    console.log('Demo roles provisioned. Existing accounts and passwords unchanged; credentials stored privately.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(() => { console.error('Demo provisioning failed; transaction rolled back. No credentials printed.'); process.exitCode = 1; });

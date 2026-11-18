// Optional isolated SQL verification; no app dependency or network database needed.
// npm install --prefix tmp/rbac-validation @electric-sql/pglite --no-audit --no-fund --package-lock=false
// node scripts/verify-role-migration.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [path.join(root, 'tmp/rbac-validation')] }));

async function verify() {
 const db = new PGlite();
 try {
  const dir = path.join(root, 'database/migrations');
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
   if (name.startsWith('005_')) await db.exec(`
    INSERT INTO organizations(id,name,code) VALUES('a0000000-0000-0000-0000-000000000001','Preservation test','PRESERVE');
    INSERT INTO users(organization_id,email,password_hash,full_name,role)
    VALUES('a0000000-0000-0000-0000-000000000001','preserve@example.test','preserved-hash-marker','Preserved user','FLEET_MANAGER');
   `);
   await db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
   console.log('Applied', name);
  }
  const { rows } = await db.query("SELECT role,password_hash,role_id IS NOT NULL normalized FROM users WHERE email='preserve@example.test'");
  assert.deepEqual(rows, [{ role:'FLEET_MANAGER',password_hash:'preserved-hash-marker',normalized:true }]);
  await db.exec(fs.readFileSync(path.join(root, 'database/tests/006_role_relationship.test.sql'), 'utf8'));
  console.log('PASS: backfill preservation and role relationship SQL assertions');
 } finally {
  await db.close();
 }
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });

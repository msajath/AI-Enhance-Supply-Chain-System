import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, withTransaction } from '../src/config/database';
import { randomUUID } from 'crypto';
import { env } from '../src/config/env';
import { assertScopeTestDatabase } from './helpers/testDatabaseGuard';
import { hasCompanyWideScope, isRole } from '../src/auth/permissions';
import type { AuthContext } from '../src/middleware/authenticate';
import {
  canAccessProject,
  findAccessibleProject,
  findUserForAuth,
  insertAccessDeniedAudit,
  listAccessibleProjects,
  listAccessibleSites,
} from '../src/modules/organization/organization.repository';

/**
 * Runs the REAL scope SQL against a migrated + seeded PostgreSQL database
 * (Jira AESCS-167 "Test cross-project restrictions", AESCS-41 "Sample company and
 * sites visible with test login").
 *
 * Opt-in, disposable database only:
 * Provision reviewed migrations/fixtures in qorvenz_verification_test separately.
 * Set NODE_ENV=test, SCOPE_INTEGRATION=1 and DB_NAME=qorvenz_verification_test explicitly.
 */
const enabled = process.env.SCOPE_INTEGRATION === '1';

describe.skipIf(!enabled)('project scope SQL against real PostgreSQL + seed data', () => {
  const ctx: Record<string, AuthContext> = {};
  const ids: Record<string, string> = {};
  let otherOrgProjectId = '';
  const organizationId = randomUUID();
  const runId = randomUUID();
  const organizationCode = `SCOPE-${runId}`;
  const auditPath = `/integration-test/${runId}`;
  let identityVerified = false;
  let fixtureCreated = false;
  const ungrantedSiteId = randomUUID();
  let ungrantedSiteCreated = false;

  beforeAll(async () => {
    await assertScopeTestDatabase(pool, process.env, env.DB_NAME);
    identityVerified = true;
    const { rows } = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
      [['admin@demo.qorvenz.test', 'warehouse.cen@demo.qorvenz.test', 'storekeeper.mat@demo.qorvenz.test', 'fleet@demo.qorvenz.test']]
    );
    expect(rows).toHaveLength(4);
    for (const { id, email } of rows) {
      const user = await findUserForAuth(id);
      if (!user || !isRole(user.role) || !user.organization_id) throw new Error(`seed user ${email} is incomplete`);
      ctx[email.split('@')[0]] = { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id };
    }
    for (const row of (await pool.query<{ id: string; code: string }>('SELECT id, code FROM projects')).rows) ids[row.code] = row.id;

    // A second company with its own project, removed again in afterAll.
    await withTransaction(async client => {
      await client.query('INSERT INTO organizations (id,name,code) VALUES ($1,$2,$3)', [organizationId, 'Scope Test Other Co', organizationCode]);
      const other = await client.query<{ id: string }>('INSERT INTO projects (organization_id,code,name) VALUES ($1,$2,$3) RETURNING id', [organizationId, `OTHER-${runId}`, 'Other company project']);
      otherOrgProjectId = other.rows[0].id;
    });
    fixtureCreated = true;
  });

  afterAll(async () => {
    try {
      if (!identityVerified) return;
      await assertScopeTestDatabase(pool, process.env, env.DB_NAME);
      await withTransaction(async client => {
        if(ungrantedSiteCreated) await client.query('DELETE FROM sites WHERE id=$1 AND code=$2',[ungrantedSiteId,`SITE-${runId}`]);
        if (fixtureCreated) {
        await client.query('DELETE FROM projects WHERE id=$1 AND organization_id=$2', [otherOrgProjectId, organizationId]);
        // Migration 006 automatically seeds company-owned roles, even without users.
        await client.query('DELETE FROM roles WHERE organization_id = $1', [organizationId]);
        await client.query('DELETE FROM organizations WHERE id = $1 AND code = $2', [organizationId, organizationCode]);
        }
        if (ctx['storekeeper.mat']) await client.query(`DELETE FROM system_audit_logs WHERE actor_id=$1 AND metadata->>'path'=$2`, [ctx['storekeeper.mat'].userId, auditPath]);
      });
    } finally {
      await pool.end();
    }
  });

  it('admin sees both fixture-plan projects and both sites, company-wide', async () => {
    expect(hasCompanyWideScope(ctx['admin'].role)).toBe(true);
    const projects = await listAccessibleProjects(ctx['admin']);
    expect(projects.map((p) => p.code).sort()).toEqual(['PRJ-GAL', 'PRJ-MAT']);
    expect(projects.every((p) => p.siteCount === 1)).toBe(true);
    expect((await listAccessibleSites(ctx['admin'])).map((s) => s.code).sort()).toEqual(['SITE-GAL-01', 'SITE-MAT-01']);
  });

  it('the central warehouse manager is granted both projects', async () => {
    expect((await listAccessibleProjects(ctx['warehouse.cen'])).map((p) => p.code).sort()).toEqual(['PRJ-GAL', 'PRJ-MAT']);
  });

  it('storekeeper.mat sees only PRJ-MAT and its site (fixture plan scope)', async () => {
    const mat = ctx['storekeeper.mat'];
    expect((await listAccessibleProjects(mat)).map((p) => p.code)).toEqual(['PRJ-MAT']);
    const sites = await listAccessibleSites(mat);
    expect(sites.map((s) => s.code)).toEqual(['SITE-MAT-01']);
  });

  it('cross-project access inside the same company is denied', async () => {
    const mat = ctx['storekeeper.mat'];
    expect(await canAccessProject(mat, ids['PRJ-MAT'])).toBe(true);
    expect(await canAccessProject(mat, ids['PRJ-GAL'])).toBe(false);
    expect(await findAccessibleProject(mat, ids['PRJ-GAL'])).toBeUndefined();
    expect(await listAccessibleSites(mat, ids['PRJ-GAL'])).toEqual([]);
  });

  it('cross-company access is denied even for an admin', async () => {
    expect(await canAccessProject(ctx['admin'], otherOrgProjectId)).toBe(false);
    expect((await listAccessibleProjects(ctx['admin'])).some((p) => p.id === otherOrgProjectId)).toBe(false);
  });

  it('a driver has no project grants in the seed', async () => {
    expect(await listAccessibleProjects(ctx['fleet'])).toEqual([]);
  });

  it('dates come back as plain YYYY-MM-DD strings', async () => {
    const project = await findAccessibleProject(ctx['admin'], ids['PRJ-GAL']);
    expect(project?.startDate).toBe('2026-02-01');
  });

  it('writes ACCESS_DENIED audit rows', async () => {
    await insertAccessDeniedAudit({ actorId: ctx['storekeeper.mat'].userId, reason: 'PROJECT_OUT_OF_SCOPE', method: 'GET', path: auditPath, projectId: ids['PRJ-GAL'] });
    const { rows } = await pool.query(`SELECT event_type, module, metadata FROM system_audit_logs WHERE actor_id=$1 AND metadata->>'path'=$2`, [ctx['storekeeper.mat'].userId, auditPath]);
    expect(rows[0]).toMatchObject({ event_type: 'ACCESS_DENIED', module: 'authz', metadata: { reason: 'PROJECT_OUT_OF_SCOPE' } });
  });
  it('does not disclose an ungranted sibling site or count it through project reads', async () => {
    await assertScopeTestDatabase(pool, process.env, env.DB_NAME);
    await pool.query('INSERT INTO sites(id,organization_id,project_id,code,name) VALUES ($1,$2,$3,$4,$5)',[
      ungrantedSiteId,ctx.admin.organizationId,ids['PRJ-GAL'],`SITE-${runId}`,'Isolated ungranted sibling site',
    ]);
    ungrantedSiteCreated=true;
    const manager=ctx['warehouse.cen'];
    expect((await listAccessibleSites(manager,ids['PRJ-GAL'])).some(s=>s.id===ungrantedSiteId)).toBe(false);
    expect((await findAccessibleProject(manager,ids['PRJ-GAL']))?.siteCount).toBe(1);
    expect((await listAccessibleSites(ctx.admin,ids['PRJ-GAL'])).some(s=>s.id===ungrantedSiteId)).toBe(true);
  });
});

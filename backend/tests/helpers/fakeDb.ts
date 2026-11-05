import { hashSync } from 'bcryptjs';
import type { MockInstance } from 'vitest';

/**
 * In-memory stand-in for PostgreSQL used by route/middleware tests.
 * It answers the tagged queries in organization.repository.ts (`/* qorvenz:<tag> *\/`)
 * plus the login lookup in auth.routes.ts, applying the same scope rules as the SQL.
 * The real SQL is covered separately by tests/scope.integration.test.ts.
 */

export const PASSWORD = 'Test-only-secret!';
const passwordHash = hashSync(PASSWORD, 4);

export const ORG_A = 'a0000000-0000-0000-0000-00000000000a';
export const ORG_B = 'a0000000-0000-0000-0000-00000000000b';

export const PROJECT_A1 = 'e0000000-0000-0000-0000-0000000000a1';
export const PROJECT_A2 = 'e0000000-0000-0000-0000-0000000000a2';
export const PROJECT_B1 = 'e0000000-0000-0000-0000-0000000000b1';
export const UNKNOWN_PROJECT = 'e0000000-0000-0000-0000-0000000000ff';

export const users = {
  adminA: { id: 'b0000000-0000-0000-0000-0000000000a0', email: 'admin.a@example.com', full_name: 'Admin A', role: 'ADMIN', organization_id: ORG_A, is_active: true },
  managerA1: { id: 'b0000000-0000-0000-0000-0000000000a1', email: 'wm.a1@example.com', full_name: 'Manager A1', role: 'WAREHOUSE_MANAGER', organization_id: ORG_A, is_active: true },
  managerNoGrants: { id: 'b0000000-0000-0000-0000-0000000000a2', email: 'wm.none@example.com', full_name: 'Manager None', role: 'WAREHOUSE_MANAGER', organization_id: ORG_A, is_active: true },
  driverA: { id: 'b0000000-0000-0000-0000-0000000000a3', email: 'driver.a@example.com', full_name: 'Driver A', role: 'FLEET_MANAGER', organization_id: ORG_A, is_active: true },
  disabledAdmin: { id: 'b0000000-0000-0000-0000-0000000000a4', email: 'off@example.com', full_name: 'Disabled', role: 'ADMIN', organization_id: ORG_A, is_active: false },
  noCompany: { id: 'b0000000-0000-0000-0000-0000000000a5', email: 'nocompany@example.com', full_name: 'No Company', role: 'WAREHOUSE_MANAGER', organization_id: null, is_active: true },
  adminB: { id: 'b0000000-0000-0000-0000-0000000000b0', email: 'admin.b@example.com', full_name: 'Admin B', role: 'ADMIN', organization_id: ORG_B, is_active: true },
} as const;

const projects = [
  { id: PROJECT_A1, organization_id: ORG_A, code: 'A1', name: 'Alpha Tower', status: 'ACTIVE', startDate: '2026-01-01', endDate: null },
  { id: PROJECT_A2, organization_id: ORG_A, code: 'A2', name: 'Alpha Bridge', status: 'ACTIVE', startDate: null, endDate: null },
  { id: PROJECT_B1, organization_id: ORG_B, code: 'B1', name: 'Beta Depot', status: 'ACTIVE', startDate: null, endDate: null },
];
const sites = [
  { id: 'f0000000-0000-0000-0000-0000000000a1', projectId: PROJECT_A1, code: 'A1-S1', name: 'Alpha Tower Site 1', address: null, status: 'ACTIVE' },
  { id: 'f0000000-0000-0000-0000-0000000000a2', projectId: PROJECT_A1, code: 'A1-S2', name: 'Alpha Tower Site 2', address: null, status: 'ACTIVE' },
  { id: 'f0000000-0000-0000-0000-0000000000a3', projectId: PROJECT_A2, code: 'A2-S1', name: 'Alpha Bridge Site', address: null, status: 'ACTIVE' },
  { id: 'f0000000-0000-0000-0000-0000000000b1', projectId: PROJECT_B1, code: 'B1-S1', name: 'Beta Depot Site', address: null, status: 'ACTIVE' },
];
const grants = [{ userId: users.managerA1.id, projectId: PROJECT_A1 }];

type Row = Record<string, unknown>;
const result = (rows: Row[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });

export interface FakeDb {
  audits: Array<{ actorId: unknown; metadata: Record<string, unknown> }>;
  failAudit: boolean;
  failQueries: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installFakeDb(query: MockInstance<any>): FakeDb {
  const db: FakeDb = { audits: [], failAudit: false, failQueries: false };
  const allUsers = Object.values(users).map((u) => ({ ...u, password_hash: passwordHash }));

  const visible = (org: unknown, companyWide: unknown, userId: unknown) =>
    projects.filter((p) => p.organization_id === org && (companyWide === true || grants.some((g) => g.userId === userId && g.projectId === p.id)));
  const summary = (p: (typeof projects)[number]) => ({
    id: p.id, code: p.code, name: p.name, status: p.status, startDate: p.startDate, endDate: p.endDate,
    siteCount: sites.filter((s) => s.projectId === p.id).length,
  });

  query.mockImplementation(async (text: unknown, params: unknown[] = []) => {
    const sql = String(text);
    const tag = /qorvenz:([\w.]+)/.exec(sql)?.[1];
    if (db.failQueries && tag !== 'audit.accessDenied') throw new Error('private SQL details: relation "projects"');
    switch (tag) {
      case 'auth.user':
        return result(allUsers.filter((u) => u.id === params[0]));
      case 'projects.canAccess':
        return result(visible(params[0], params[1], params[2]).filter((p) => p.id === params[3]).map(() => ({ '?column?': 1 })));
      case 'projects.list':
        return result(visible(params[0], params[1], params[2]).map(summary));
      case 'projects.get':
        return result(visible(params[0], params[1], params[2]).filter((p) => p.id === params[3]).map(summary));
      case 'sites.list': {
        const inScope = visible(params[0], params[1], params[2]).filter((p) => params[3] === null || p.id === params[3]);
        return result(sites.filter((s) => inScope.some((p) => p.id === s.projectId)).map((s) => {
          const p = projects.find((x) => x.id === s.projectId)!;
          return { ...s, projectCode: p.code, projectName: p.name };
        }));
      }
      case 'audit.accessDenied':
        if (db.failAudit) throw new Error('audit table unavailable');
        db.audits.push({ actorId: params[0], metadata: JSON.parse(String(params[1])) });
        return result([]);
      default:
        // Health probe in config/database.ts
        if (sql.includes('SELECT 1 AS health_check')) return result([{ health_check: 1 }]);
        // /auth/me and /auth/session lookups in auth.routes.ts
        if (/FROM users WHERE id = \$1/.test(sql)) return result(allUsers.filter((u) => u.id === params[0]));
        // Login lookup in auth.routes.ts
        if (/FROM users WHERE lower\(email\) = lower\(\$1\)/.test(sql)) {
          return result(allUsers.filter((u) => u.email.toLowerCase() === String(params[0]).toLowerCase()));
        }
        throw new Error(`fakeDb: unexpected query ${sql.slice(0, 80)}`);
    }
  });
  return db;
}

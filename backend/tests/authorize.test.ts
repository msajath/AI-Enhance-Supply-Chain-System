import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../src/config/database';
import { isUuid, requireProjectAccess, requireRole } from '../src/middleware/authorize';
import type { AuthContext } from '../src/middleware/authenticate';
import { installFakeDb, ORG_A, ORG_B, PROJECT_A1, PROJECT_A2, PROJECT_B1, UNKNOWN_PROJECT, users, type FakeDb } from './helpers/fakeDb';

/**
 * Unit tests for the role guard and project-scope middleware (Jira AESCS-39 subtasks
 * "Implement role authorization middleware" and "Implement project scope access checks").
 * Runs the middleware directly with fake req/res objects. No HTTP server needed.
 */

const query = vi.spyOn(pool, 'query');
let db: FakeDb;
beforeEach(() => { query.mockReset(); db = installFakeDb(query); });

const auth = (user: { id: string; email: string; role: string; organization_id: string | null }): AuthContext => ({
  userId: user.id, email: user.email, role: user.role as AuthContext['role'], organizationId: user.organization_id as string,
});

function call(middleware: (req: Request, res: Response, next: NextFunction) => unknown, reqInit: Partial<Request> & { auth?: AuthContext }) {
  const req = { method: 'GET', originalUrl: '/api/v1/test?x=1', params: {}, query: {}, ...reqInit } as unknown as Request;
  const res = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown; status: (c: number) => unknown; json: (b: unknown) => unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  const next = vi.fn();
  return Promise.resolve(middleware(req, res as unknown as Response, next)).then(() => ({ res, next }));
}

describe('requireRole', () => {
  it('passes a permitted role through without auditing', async () => {
    const { res, next } = await call(requireRole('ADMIN', 'WAREHOUSE_MANAGER'), { auth: auth(users.managerA1) });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(db.audits).toHaveLength(0);
  });

  it('returns 403 FORBIDDEN for a role outside the list and audits the denial', async () => {
    const { res, next } = await call(requireRole('ADMIN', 'WAREHOUSE_MANAGER'), { auth: auth(users.driverA), method: 'GET', originalUrl: '/api/v1/projects?status=ACTIVE' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    expect(db.audits).toEqual([{
      actorId: users.driverA.id,
      metadata: { reason: 'ROLE_NOT_PERMITTED', method: 'GET', path: '/api/v1/projects', role: 'DRIVER', requiredRoles: ['ADMIN', 'WAREHOUSE_MANAGER'] },
    }]);
  });

  it('returns 401 when no authenticated user is attached', async () => {
    const { res, next } = await call(requireRole('ADMIN'), {});
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('still returns 403 when writing the audit record fails', async () => {
    db.failAudit = true;
    const { res } = await call(requireRole('ADMIN'), { auth: auth(users.driverA) });
    expect(res.statusCode).toBe(403);
  });

  it('refuses to be configured without roles', () => {
    expect(() => requireRole()).toThrow();
  });
});

describe('requireProjectAccess', () => {
  const byParam = requireProjectAccess((req) => req.params.projectId);

  it('lets a scoped user into a project they were granted', async () => {
    const { next } = await call(byParam, { auth: auth(users.managerA1), params: { projectId: PROJECT_A1 } });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('denies a scoped user a project in their own company that they were NOT granted', async () => {
    const { res, next } = await call(byParam, { auth: auth(users.managerA1), params: { projectId: PROJECT_A2 } });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(db.audits[0].metadata).toMatchObject({ reason: 'PROJECT_OUT_OF_SCOPE', projectId: PROJECT_A2, role: 'WAREHOUSE_MANAGER' });
  });

  it('lets a company-wide admin into any project of their company', async () => {
    for (const projectId of [PROJECT_A1, PROJECT_A2]) {
      const { next } = await call(byParam, { auth: auth(users.adminA), params: { projectId } });
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('denies an admin a project that belongs to another company (cross-tenant)', async () => {
    const { res } = await call(byParam, { auth: auth(users.adminA), params: { projectId: PROJECT_B1 } });
    expect(res.statusCode).toBe(403);
    const other = await call(byParam, { auth: auth(users.adminB), params: { projectId: PROJECT_A1 } });
    expect(other.res.statusCode).toBe(403);
  });

  it('answers unknown projects exactly like out-of-scope ones (no ID probing)', async () => {
    const unknown = await call(byParam, { auth: auth(users.adminA), params: { projectId: UNKNOWN_PROJECT } });
    const foreign = await call(byParam, { auth: auth(users.adminA), params: { projectId: PROJECT_B1 } });
    expect(unknown.res.statusCode).toBe(403);
    expect((unknown.res.body as { error: unknown }).error).toEqual((foreign.res.body as { error: unknown }).error);
  });

  it('rejects malformed project IDs with 400 before touching the database', async () => {
    const { res } = await call(byParam, { auth: auth(users.adminA), params: { projectId: "1' OR '1'='1" } });
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires a project ID unless configured as optional', async () => {
    expect((await call(byParam, { auth: auth(users.adminA), params: {} })).res.statusCode).toBe(400);
    const optional = requireProjectAccess(() => undefined, { optional: true });
    expect((await call(optional, { auth: auth(users.adminA) })).next).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without leaking SQL when the scope query fails', async () => {
    db.failQueries = true;
    const { res } = await call(byParam, { auth: auth(users.adminA), params: { projectId: PROJECT_A1 } });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/SQL|relation/);
  });

  it('uses the company from the authenticated context, not from the request', async () => {
    // A forged organizationId in the query string must not matter.
    const { res } = await call(byParam, { auth: auth(users.adminA), params: { projectId: PROJECT_B1 }, query: { organizationId: ORG_B } });
    expect(res.statusCode).toBe(403);
    expect(query.mock.calls[0][1]).toEqual([ORG_A, true, users.adminA.id, PROJECT_B1]);
  });
});

describe('isUuid', () => {
  it('accepts UUIDs and rejects everything else', () => {
    expect(isUuid(PROJECT_A1)).toBe(true);
    for (const bad of ['', 'abc', '123', null, undefined, 42, `${PROJECT_A1} `]) expect(isUuid(bad)).toBe(false);
  });
});

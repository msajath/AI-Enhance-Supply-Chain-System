import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { installFakeDb, PASSWORD, PROJECT_A1, PROJECT_A2, PROJECT_B1, users, type FakeDb } from './helpers/fakeDb';

/**
 * HTTP tests for GET /projects and GET /sites (Jira AESCS-39 acceptance criteria 1 + 2,
 * AESCS-167 "Test cross-project restrictions").
 */

const query = vi.spyOn(pool, 'query');
let db: FakeDb;
beforeEach(() => { query.mockReset(); db = installFakeDb(query); });

const app = () => createApp(new session.MemoryStore());
const tokenFor = (user: { id: string }) =>
  jwt.sign({ sub: user.id }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
const as = (user: { id: string }) => ({ Authorization: `Bearer ${tokenFor(user)}` });
const codes = (items: Array<{ code: string }>) => items.map((i) => i.code).sort();

describe('GET /api/v1/projects', () => {
  it('requires authentication', async () => {
    const res = await request(app()).get('/api/v1/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('gives a company-wide admin every project in their company and nothing from other companies', async () => {
    const res = await request(app()).get('/api/v1/projects').set(as(users.adminA));
    expect(res.status).toBe(200);
    expect(codes(res.body.data.projects)).toEqual(['A1', 'A2']);
    expect(res.body.data.scope).toEqual({ companyWide: true });
  });

  it('gives a warehouse manager only the projects they were granted', async () => {
    const res = await request(app()).get('/api/v1/projects').set(as(users.managerA1));
    expect(res.status).toBe(200);
    expect(codes(res.body.data.projects)).toEqual(['A1']);
    expect(res.body.data.scope).toEqual({ companyWide: false });
  });

  it('returns an empty list (not an error) for a manager with no grants', async () => {
    const res = await request(app()).get('/api/v1/projects').set(as(users.managerNoGrants));
    expect(res.status).toBe(200);
    expect(res.body.data.projects).toEqual([]);
  });

  it('returns 403 for a role without project access and logs the denial', async () => {
    const res = await request(app()).get('/api/v1/projects').set(as(users.driverA));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({ actorId: users.driverA.id, metadata: { reason: 'ROLE_NOT_PERMITTED', path: '/api/v1/projects' } });
  });

  it('works with the web app session cookie as well as a bearer token', async () => {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: users.managerA1.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const res = await agent.get('/api/v1/projects');
    expect(res.status).toBe(200);
    expect(codes(res.body.data.projects)).toEqual(['A1']);
  });

  it('rejects disabled users and users without a company', async () => {
    expect((await request(app()).get('/api/v1/projects').set(as(users.disabledAdmin))).status).toBe(401);
    expect((await request(app()).get('/api/v1/projects').set(as(users.noCompany))).status).toBe(403);
  });

  it('does not leak database errors', async () => {
    db.failQueries = true;
    const res = await request(app()).get('/api/v1/projects').set(as(users.adminA));
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/SQL|relation|stack/);
  });
});

describe('GET /api/v1/projects/:projectId', () => {
  it('returns a project in scope', async () => {
    const res = await request(app()).get(`/api/v1/projects/${PROJECT_A1}`).set(as(users.managerA1));
    expect(res.status).toBe(200);
    expect(res.body.data.project).toMatchObject({ id: PROJECT_A1, code: 'A1', siteCount: 2 });
  });

  it('returns 403 for another project in the same company and audits it', async () => {
    const res = await request(app()).get(`/api/v1/projects/${PROJECT_A2}`).set(as(users.managerA1));
    expect(res.status).toBe(403);
    expect(db.audits[0].metadata).toMatchObject({ reason: 'PROJECT_OUT_OF_SCOPE', projectId: PROJECT_A2 });
  });

  it('returns 403 for another company\'s project, even for an admin', async () => {
    expect((await request(app()).get(`/api/v1/projects/${PROJECT_B1}`).set(as(users.adminA))).status).toBe(403);
  });

  it('returns 400 for a malformed ID', async () => {
    expect((await request(app()).get('/api/v1/projects/not-a-uuid').set(as(users.adminA))).status).toBe(400);
  });
});

describe('GET /api/v1/sites', () => {
  it('lists only sites of projects in scope', async () => {
    const manager = await request(app()).get('/api/v1/sites').set(as(users.managerA1));
    expect(manager.status).toBe(200);
    expect(codes(manager.body.data.sites)).toEqual(['A1-S1', 'A1-S2']);
    const admin = await request(app()).get('/api/v1/sites').set(as(users.adminA));
    expect(codes(admin.body.data.sites)).toEqual(['A1-S1', 'A1-S2', 'A2-S1']);
  });

  it('filters by an allowed project', async () => {
    const res = await request(app()).get(`/api/v1/sites?projectId=${PROJECT_A2}`).set(as(users.adminA));
    expect(res.status).toBe(200);
    expect(codes(res.body.data.sites)).toEqual(['A2-S1']);
  });

  it('returns 403 (not an empty list) when filtering by a project out of scope', async () => {
    const sameCompany = await request(app()).get(`/api/v1/sites?projectId=${PROJECT_A2}`).set(as(users.managerA1));
    expect(sameCompany.status).toBe(403);
    const otherCompany = await request(app()).get(`/api/v1/sites?projectId=${PROJECT_B1}`).set(as(users.adminA));
    expect(otherCompany.status).toBe(403);
    expect(db.audits).toHaveLength(2);
  });

  it('returns 403 for /projects/:id/sites out of scope and 200 in scope', async () => {
    expect((await request(app()).get(`/api/v1/projects/${PROJECT_B1}/sites`).set(as(users.adminA))).status).toBe(403);
    const ok = await request(app()).get(`/api/v1/projects/${PROJECT_A1}/sites`).set(as(users.managerA1));
    expect(ok.status).toBe(200);
    expect(codes(ok.body.data.sites)).toEqual(['A1-S1', 'A1-S2']);
  });

  it('rejects malformed or repeated projectId filters', async () => {
    expect((await request(app()).get('/api/v1/sites?projectId=abc').set(as(users.adminA))).status).toBe(400);
    expect((await request(app()).get(`/api/v1/sites?projectId=${PROJECT_A1}&projectId=${PROJECT_A2}`).set(as(users.adminA))).status).toBe(400);
  });

  it('returns 403 for drivers', async () => {
    expect((await request(app()).get('/api/v1/sites').set(as(users.driverA))).status).toBe(403);
  });
});

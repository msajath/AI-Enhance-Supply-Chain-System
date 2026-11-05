import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { installFakeDb, PASSWORD, users } from './helpers/fakeDb';

/**
 * Sprint 1 API smoke tests (Jira AESCS-46 / AESCS-166, Member 4).
 * Covers: GET /health, successful/failed login, and missing / expired / tampered /
 * wrong-audience tokens on both the auth API and a protected business route.
 *
 * Run:  cd apps/api && npx vitest run tests/smoke.test.ts
 */

const query = vi.spyOn(pool, 'query');
beforeEach(() => { query.mockReset(); installFakeDb(query); });

const app = () => createApp(new session.MemoryStore());
const sign = (payload: { sub: string; exp?: number }, options: jwt.SignOptions = {}, secret = env.JWT_SECRET) =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE,
    ...(payload.exp === undefined ? { expiresIn: '5m' } : {}),
    ...options,
  });
const PROTECTED = ['/api/v1/auth/me', '/api/v1/projects'];

describe('smoke: health', () => {
  it('GET /health reports a healthy service with a connected database', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'healthy', service: 'qorvenz-api', database: { status: 'connected' } });
  });

  it('GET /api/v1/health is also available', async () => {
    expect((await request(app()).get('/api/v1/health')).status).toBe(200);
  });
});

describe('smoke: login', () => {
  it('signs in with valid credentials and returns a usable bearer token', async () => {
    const res = await request(app()).post('/api/v1/auth/login').send({ email: users.adminA.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', user: { email: users.adminA.email, role: 'Admin' } });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^qorvenz\.sid=.*HttpOnly/i);
    const me = await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(users.adminA.email);
  });

  it('rejects a wrong password with 401 and no session cookie', async () => {
    const res = await request(app()).post('/api/v1/auth/login').send({ email: users.adminA.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an unknown email with the same 401 response', async () => {
    const res = await request(app()).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe.each(PROTECTED)('smoke: token handling on %s', (path) => {
  it('missing token → 401', async () => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('expired token → 401', async () => {
    const expired = sign({ sub: users.adminA.id, exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(app()).get(path).set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    if (path === '/api/v1/projects') expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('tampered, wrongly signed or wrong-audience token → 401', async () => {
    const good = sign({ sub: users.adminA.id });
    const tokens = [
      `${good}x`,
      sign({ sub: users.adminA.id }, {}, 'a-completely-different-secret-of-32-chars!!'),
      sign({ sub: users.adminA.id }, { audience: 'someone-else' }),
      'not-a-jwt',
    ];
    for (const token of tokens) {
      expect((await request(app()).get(path).set('Authorization', `Bearer ${token}`)).status).toBe(401);
    }
  });

  it('valid token → 200', async () => {
    const res = await request(app()).get(path).set('Authorization', `Bearer ${sign({ sub: users.adminA.id })}`);
    expect(res.status).toBe(200);
  });
});

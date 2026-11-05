import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { hashSync } from 'bcryptjs';
import { pool } from '../src/config/database';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
const query = vi.spyOn(pool, 'query');
const password = 'Test-only-secret!';
const row = { id: 'b0000000-0000-0000-0000-000000000001', email: 'member@example.com', full_name: 'Example Member', role: 'ADMIN', is_active: true, password_hash: hashSync(password, 12) };
const response = (rows: unknown[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
beforeEach(() => { query.mockReset(); });
describe('authentication API with isolated database and session store', () => {
  it('rejects invalid input without querying the database', async () => {
    const res = await request(createApp(new session.MemoryStore())).post('/api/v1/auth/login').send({ email: 'invalid', password: '' });
    expect(res.status).toBe(400); expect(query).not.toHaveBeenCalled();
  });
  it('uses identical status and error for unknown email, wrong password, disabled and unsupported accounts', async () => {
    const app = createApp(new session.MemoryStore());
    const results = [];
    for (const rows of [[], [row], [{ ...row, is_active: false }], [{ ...row, role: 'VIEWER' }]]) {
      query.mockResolvedValueOnce(response(rows));
      const res = await request(app).post('/api/v1/auth/login').send({ email: row.email, password: rows[0] === row ? 'incorrect' : password });
      expect(res.status).toBe(401); results.push(res.body.error);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    for (const error of results) expect(error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
  });
  it('creates a cookie session, restores fresh server roles, and invalidates on logout', async () => {
    query.mockResolvedValue(response([row]));
    const app = createApp(new session.MemoryStore());
    const agent = request.agent(app);
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
    const login = await agent.post('/api/v1/auth/login').send({ email: row.email, password });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;
    expect(typeof token).toBe('string');
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ sub: row.id, iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE });
    expect(claims.exp).toBeTypeOf('number');
    expect(Object.keys(claims).sort()).toEqual(['aud', 'av', 'exp', 'iat', 'iss', 'sub']);
    expect(login.body.data.user.role).toBe('Admin');
    expect(login.body.data.user.password_hash).toBeUndefined();
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(login.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    query.mockResolvedValue(response([{ ...row, role: 'FLEET_MANAGER' }]));
    const restored = await agent.get('/api/v1/auth/session');
    expect(restored.body.data.user.role).toBe('Fleet manager');
    expect(restored.headers['cache-control']).toBe('no-store');
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });
  it('accepts a valid bearer token and rejects modified tokens', async () => {
    query.mockResolvedValue(response([row]));
    const app = createApp(new session.MemoryStore());
    const login = await request(app).post('/api/v1/auth/login').send({ email: row.email, password });
    const token = login.body.data.accessToken as string;
    query.mockResolvedValue(response([row]));
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}tampered`)).status).toBe(401);
  });
  it('revokes access for a disabled user', async () => {
    query.mockResolvedValue(response([row]));
    const agent = request.agent(createApp(new session.MemoryStore()));
    await agent.post('/api/v1/auth/login').send({ email: row.email, password });
    query.mockResolvedValue(response([{ ...row, is_active: false }]));
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });
  it('does not leak database failures', async () => {
    query.mockRejectedValue(new Error('private SQL details'));
    const res = await request(createApp(new session.MemoryStore())).post('/api/v1/auth/login').send({ email: row.email, password });
    expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toMatch(/SQL|stack|private/);
  });
  it('rejects cross-origin login and unknown browser-supplied roles', async () => {
    const app = createApp(new session.MemoryStore());
    expect((await request(app).post('/api/v1/auth/login').set('Origin', 'https://untrusted.example').send({ email: row.email, password })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/login').send({ email: row.email, password, role: 'SUPERUSER' })).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('role-based login: the selected role must match the stored role and can never grant one', async () => {
    const driver = { ...row, role: 'FLEET_MANAGER' };
    const app = createApp(new session.MemoryStore());
    query.mockResolvedValueOnce(response([driver]));
    const escalation = await request(app).post('/api/v1/auth/login').send({ email: row.email, password, role: 'ADMIN' });
    expect(escalation.status).toBe(403);
    expect(escalation.body.error.code).toBe('ROLE_MISMATCH');
    expect(escalation.headers['set-cookie']).toBeUndefined();
    expect(escalation.body.data).toBeUndefined();
    query.mockResolvedValueOnce(response([driver]));
    const allowed = await request(app).post('/api/v1/auth/login').send({ email: row.email, password, role: 'FLEET_MANAGER' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.user.role).toBe('Fleet manager');
    query.mockResolvedValueOnce(response([driver]));
    const wrongPassword = await request(app).post('/api/v1/auth/login').send({ email: row.email, password: 'incorrect', role: 'ADMIN' });
    expect(wrongPassword.status).toBe(401);
  });
  it.each(['ADMIN','FLEET_MANAGER','WAREHOUSE_MANAGER'])('rejects public self-provisioning of %s accounts', async role=>{
    const res=await request(createApp(new session.MemoryStore())).post('/api/v1/auth/signup').send({fullName:'New Person',email:'new@example.com',password:'long-enough-1',role});
    expect(res.status).toBe(403);expect(query).not.toHaveBeenCalled();expect(res.headers['set-cookie']).toBeUndefined();
  });
  it('rejects malformed JSON without returning a stack trace', async () => {
    const res = await request(createApp(new session.MemoryStore())).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad-json');
    expect(res.status).toBe(400); expect(JSON.stringify(res.body)).not.toMatch(/stack|SyntaxError/);
  });
  it('rate limits repeated login attempts', async () => {
    const app = createApp(new session.MemoryStore());
    for (let count = 0; count < 20; count++) await request(app).post('/api/v1/auth/login').send({});
    expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(429);
  });
});

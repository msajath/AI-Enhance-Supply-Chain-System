import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';

// Opt in only against a dedicated disposable database, never the team database.
const enabled = process.env.AUTH_INTEGRATION === '1';
describe.skipIf(!enabled)('real PostgreSQL authentication integration', () => {
  const id = randomUUID();
  const email = `login-${id}@example.com`;
  const password = 'Integration-only-password!';
  beforeAll(async () => {
    if (env.DB_NAME !== 'qorvenz_auth_test') throw new Error('Integration tests require DB_NAME=qorvenz_auth_test');
    const migrationPath = path.resolve(__dirname, '../../database/migrations/001_sprint1_foundation.sql');
    await pool.query(readFileSync(migrationPath, 'utf8'));
    await pool.query('INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5)', [id, email, await hash(password, 12), 'Integration User', 'DRIVER']);
  });
  afterAll(async () => { if (env.DB_NAME === 'qorvenz_auth_test') await pool.query('DELETE FROM users WHERE id=$1', [id]); await pool.end(); });
  it('validates a real hash, persists the session across app instances, and revokes it on logout', async () => {
    const first = createApp();
    const login = await request(first).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('Driver');
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await pool.query('SELECT sid FROM session WHERE sess->>\'userId\'=$1', [id])).rowCount).toBe(1);
    const second = createApp();
    expect((await request(second).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(200);
    const wrong = await request(second).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    const unknown = await request(second).post('/api/v1/auth/login').send({ email: 'unknown@example.com', password });
    const wrongRole = await request(second).post('/api/v1/auth/login').send({ email, password, role: 'ADMIN' });
    expect(wrongRole.status).toBe(403); expect(wrongRole.body.error.code).toBe('ROLE_MISMATCH');
    expect(wrongRole.headers['set-cookie']).toBeUndefined();
    const rightRole = await request(second).post('/api/v1/auth/login').send({ email, password, role: 'DRIVER' });
    expect(rightRole.status).toBe(200);
    expect(wrong.status).toBe(401); expect(unknown.status).toBe(401); expect(wrong.body.error).toEqual(unknown.body.error);
    expect((await request(second).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(200);
    expect((await request(first).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });
});

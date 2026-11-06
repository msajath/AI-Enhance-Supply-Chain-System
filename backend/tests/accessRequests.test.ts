import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { compareSync } from 'bcryptjs';
import { pool } from '../src/config/database';
import { createApp } from '../src/app';

// Public "Request an account" form: POST /api/v1/auth/access-requests
const query = vi.spyOn(pool, 'query');
const response = (rows: unknown[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
const valid = { fullName: 'New Storekeeper', email: 'New.Person@Example.com', organizationCode: 'qor-hq-01', requestedRole: 'WAREHOUSE_MANAGER', password: 'long-enough-password' };
const send = (body: unknown) => request(createApp(new session.MemoryStore())).post('/api/v1/auth/access-requests').send(body as object);
const SENT = 'Your request has been sent to your administrator.';
beforeEach(() => { query.mockReset(); });

describe('access requests from the sign-in page', () => {
  it.each([
    ['an Admin role', { ...valid, requestedRole: 'ADMIN' }],
    ['a short password', { ...valid, password: 'short' }],
    ['a bad email', { ...valid, email: 'not-an-email' }],
    ['a missing company code', { ...valid, organizationCode: '' }],
    ['extra fields', { ...valid, is_active: true }],
  ])('rejects %s without touching the database', async (_label, body) => {
    const res = await send(body);
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('stores a pending request with a hashed password and a lower-case email', async () => {
    query
      .mockResolvedValueOnce(response([{ id: 'org-1' }]))      // company lookup
      .mockResolvedValueOnce(response([]))                     // no existing user
      .mockResolvedValueOnce(response([{ id: 'req-1' }]))      // insert request
      .mockResolvedValueOnce(response([]));                    // audit
    const res = await send(valid);
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(SENT);
    const insert = query.mock.calls[2] as unknown as [string, unknown[]];
    expect(insert[0]).toMatch(/INSERT INTO access_requests/);
    const [orgId, email, name, role, hash] = insert[1] as string[];
    expect({ orgId, email, name, role }).toEqual({ orgId: 'org-1', email: 'new.person@example.com', name: 'New Storekeeper', role: 'WAREHOUSE_MANAGER' });
    expect(hash).not.toBe(valid.password);
    expect(compareSync(valid.password, hash)).toBe(true);
  });

  it('accepts Driver requests', async () => {
    query.mockResolvedValueOnce(response([{ id: 'org-1' }])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([{ id: 'req-2' }])).mockResolvedValueOnce(response([]));
    const res = await send({ ...valid, requestedRole: 'DRIVER' });
    expect(res.status).toBe(202);
    expect((query.mock.calls[2] as unknown as [string, unknown[]])[1][3]).toBe('DRIVER');
  });

  it('tells the person when the company code is wrong, and saves nothing', async () => {
    query.mockResolvedValueOnce(response([]));
    const res = await send({ ...valid, organizationCode: 'NOPE' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COMPANY_NOT_FOUND');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('tells the person when an account with that email already exists, and saves nothing', async () => {
    query.mockResolvedValueOnce(response([{ id: 'org-1' }])).mockResolvedValueOnce(response([{ '?column?': 1 }]));
    const res = await send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('tells the person when a request is already waiting', async () => {
    query.mockResolvedValueOnce(response([{ id: 'org-1' }])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));
    const res = await send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_PENDING');
  });

  it('does not leak database errors', async () => {
    query.mockRejectedValueOnce(new Error('private SQL details'));
    const res = await send(valid);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/private|SQL/);
  });

  it('still refuses the old direct sign-up endpoint', async () => {
    const res = await request(createApp(new session.MemoryStore())).post('/api/v1/auth/signup').send({ fullName: 'X', email: 'x@example.com', password: 'long-enough-1' });
    expect(res.status).toBe(403);
  });
});

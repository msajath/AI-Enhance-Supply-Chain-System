import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { compare } from 'bcryptjs';
import nodemailer from 'nodemailer';
import { pool } from '../src/config/database';
import { consumeRecovery, createPasswordResetRouter, issueRecovery, recoveryConfig, recoveryEmail, resetSchema, sendRecovery, tokenDigest } from '../src/modules/auth/password-reset';

const user = { id: 'test-user', email: 'member@example.test', is_active: true, role: 'ADMIN' };
const token = 'ab'.repeat(32);
const password = 'A new testing password!';
const query = vi.fn();
const release = vi.fn();
beforeEach(() => {
  vi.stubEnv('PASSWORD_RESET_ENABLED', 'true');
  vi.spyOn(pool, 'connect').mockResolvedValue({ query, release } as never);
  query.mockReset(); release.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function app() { const app = express(); app.use(express.json(), createPasswordResetRouter()); return app; }
describe('password recovery security', () => {
  it('passes both email formats to SMTP using the configured origin', async () => {
    vi.stubEnv('SMTP_HOST', 'mail.example.test'); vi.stubEnv('SMTP_FROM', 'support@example.test');
    vi.stubEnv('PASSWORD_RESET_ORIGIN', 'https://qorvenz.example');
    const sendMail = vi.fn().mockResolvedValue({}); const close = vi.fn();
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close } as never);
    await sendRecovery(user.email, token);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: user.email, text: expect.stringContaining('https://qorvenz.example/reset-password#token='), html: expect.stringContaining('Reset Password') });
    expect(close).toHaveBeenCalled();
  });
  it.each(['', 'short', 'x'.repeat(64), 'ab'.repeat(33)])('rejects malformed tokens %s', value => {
    expect(resetSchema.safeParse({ token: value, newPassword: password, confirmPassword: password }).success).toBe(false);
  });
  it('enforces password policy, confirmation and bcrypt byte limit', () => {
    for (const [newPassword, confirmPassword] of [['short', 'short'], [password, 'different'], ['😀'.repeat(20), '😀'.repeat(20)]]) {
      expect(resetSchema.safeParse({ token, newPassword, confirmPassword }).success).toBe(false);
    }
  });
  it('persists only a digest and sends a 32-byte random secret to the email abstraction', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT id') ? [user] : [], rowCount: 0 }));
    const send = vi.fn().mockResolvedValue(undefined);
    await issueRecovery(user.email, send);
    const raw = send.mock.calls[0][1];
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('INSERT'))!;
    expect(insert[1][1]).toBe(tokenDigest(raw));
    expect(JSON.stringify(query.mock.calls)).not.toContain(raw);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it.each([undefined, { ...user, is_active: false }, { ...user, role: 'VIEWER' }])('does not email ineligible accounts', async row => {
    query.mockResolvedValue({ rows: row ? [row] : [], rowCount: 0 });
    const send = vi.fn(); await issueRecovery(user.email, send); expect(send).not.toHaveBeenCalled();
  });
  it('suppresses repeated email within the database cooldown', async () => {
    query.mockResolvedValue({ rows: [user], rowCount: 1 });
    const send = vi.fn(); await issueRecovery(user.email, send); expect(send).not.toHaveBeenCalled();
  });
  it('rolls back failed delivery without logging provider errors', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT id') ? [user] : [], rowCount: 0 }));
    await expect(issueRecovery(user.email, async () => { throw new Error(token); })).rejects.toThrow('Recovery unavailable');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(release).toHaveBeenCalled();
  });
  it('hashes the new password, revokes sessions, and commits only after consumption', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT u.') ? [user] : [], rowCount: 1 }));
    expect(await consumeRecovery(token, password)).toBe(true);
    const update = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE users'))!;
    expect(await compare(password, update[1][0])).toBe(true);
    expect(update[0]).toContain('auth_version=auth_version+1');
    expect(update[0]).not.toMatch(/SET.*role=/);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('does not update passwords when expiry or single-use predicate rejects consumption', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT u.') ? [user] : [], rowCount: 0 }));
    expect(await consumeRecovery(token, password)).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE users'))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('rolls back token consumption when updating the password fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE users')) throw new Error('private database error');
      return { rows: sql.startsWith('SELECT u.') ? [user] : [], rowCount: 1 };
    });
    await expect(consumeRecovery(token, password)).rejects.toThrow('Recovery unavailable');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('returns the same generic response for an unknown account and delivery failure', async () => {
    const first = await request(app()).post('/forgot-password').set('Host', 'attacker.test').send({ email: user.email });
    query.mockRejectedValueOnce(new Error('private error'));
    const second = await request(app()).post('/forgot-password').send({ email: user.email });
    expect(first.status).toBe(202); expect(second.body).toMatchObject({ success: first.body.success, data: first.body.data, message: first.body.message });
    expect(JSON.stringify(first.body)).not.toContain(tokenDigest(token));
  });
  it('rejects missing tokens and throttles recovery attempts', async () => {
    const server = app();
    expect((await request(server).post('/reset-password').send({ newPassword: password })).status).toBe(400);
    for (let i = 0; i < 9; i++) await request(server).post('/forgot-password').send({ email: 'invalid' });
    expect((await request(server).post('/forgot-password').send({ email: user.email })).status).toBe(429);
  });
  it('uses an explicit HTTPS production origin and bounded lifetime', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PASSWORD_RESET_ORIGIN', 'http://attacker.test');
    expect(recoveryConfig).toThrow();
    vi.stubEnv('PASSWORD_RESET_ORIGIN', 'https://qorvenz.example');
    expect(recoveryConfig().origin).toBe('https://qorvenz.example');
    vi.stubEnv('PASSWORD_RESET_TTL_MINUTES', '200'); expect(recoveryConfig).toThrow();
  });
  it('email contains only instructions and a recovery link', () => {
    const mail = recoveryEmail('https://qorvenz.example/reset-password#token=' + token, 20);
    expect(mail.text).toContain(token); expect(mail.html).toContain('Reset Password');
    expect(JSON.stringify(mail)).not.toContain(password);
    expect(JSON.stringify(mail)).not.toMatch(/password_hash|Bearer|eyJ/);
  });
});

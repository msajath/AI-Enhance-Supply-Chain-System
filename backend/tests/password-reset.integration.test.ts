import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { hash, compare } from 'bcryptjs';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { consumeRecovery, issueRecovery } from '../src/modules/auth/password-reset';

// Requires an already provisioned disposable database with the APPROVED proposal applied.
// This test intentionally never applies migrations or extends the schema itself.
describe.skipIf(process.env.PASSWORD_RESET_INTEGRATION !== '1')('PostgreSQL reset atomicity', () => {
  const id = randomUUID();
  const email = `reset-${id}@example.test`;
  let token = '';
  beforeAll(async () => {
    if (env.DB_NAME !== 'qorvenz_auth_test') throw new Error('Requires DB_NAME=qorvenz_auth_test');
    await pool.query('INSERT INTO users (id,email,password_hash,full_name,role) VALUES ($1,$2,$3,$4,$5)', [id, email, await hash('Original test password!', 12), 'Reset Test', 'ADMIN']);
    await issueRecovery(email, async (_email, raw) => { token = raw; });
  });
  afterAll(async () => {
    if (env.DB_NAME === 'qorvenz_auth_test') await pool.query('DELETE FROM users WHERE id=$1', [id]);
    await pool.end();
  });
  it('allows exactly one concurrent reset, prevents replay, revokes sessions and preserves role', async () => {
    const before = (await pool.query('SELECT role,auth_version FROM users WHERE id=$1', [id])).rows[0];
    const results = await Promise.all([consumeRecovery(token, 'New integration password!'), consumeRecovery(token, 'New integration password!')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeRecovery(token, 'Replay test password!')).toBe(false);
    const after = (await pool.query('SELECT password_hash,role,auth_version FROM users WHERE id=$1', [id])).rows[0];
    expect(await compare('New integration password!', after.password_hash)).toBe(true);
    expect(await compare('Original test password!', after.password_hash)).toBe(false);
    expect(after.role).toBe(before.role); expect(after.auth_version).toBe(before.auth_version + 1);
  });
  it('rejects expired tokens and supersedes previous requests', async () => {
    await pool.query("UPDATE password_reset_tokens SET created_at=clock_timestamp()-interval '10 minutes' WHERE user_id=$1", [id]);
    await issueRecovery(email, async (_email, raw) => { token = raw; });
    const expired = token;
    await pool.query("UPDATE password_reset_tokens SET created_at=clock_timestamp()-interval '30 minutes', expires_at=clock_timestamp()-interval '1 minute' WHERE user_id=$1", [id]);
    expect(await consumeRecovery(expired, 'Expired test password!')).toBe(false);
    await issueRecovery(email, async (_email, raw) => { token = raw; });
    await pool.query("UPDATE password_reset_tokens SET created_at=clock_timestamp()-interval '10 minutes' WHERE user_id=$1", [id]);
    const superseded = token;
    await issueRecovery(email, async (_email, raw) => { token = raw; });
    expect(await consumeRecovery(superseded, 'Superseded test password!')).toBe(false);
    expect(await consumeRecovery(token, 'Latest test password!')).toBe(true);
  });
});

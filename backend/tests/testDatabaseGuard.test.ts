import { describe, expect, it, vi } from 'vitest';
import { assertScopeTestDatabase, VERIFICATION_DATABASE } from './helpers/testDatabaseGuard';

const valid = { NODE_ENV: 'test', SCOPE_INTEGRATION: '1', DB_NAME: VERIFICATION_DATABASE };
describe('scope integration target protection', () => {
  it.each([
    {}, { ...valid, NODE_ENV: 'production' }, { ...valid, NODE_ENV: 'development' },
    { ...valid, SCOPE_INTEGRATION: undefined }, { ...valid, DB_NAME: undefined },
    { ...valid, DB_NAME: 'qorvenz_db' }, { ...valid, DB_NAME: 'production' },
    { ...valid, DB_NAME: 'unknown_test' },
  ])('rejects unsafe or missing settings without even querying: %j', async settings => {
    const query = vi.fn();
    await expect(assertScopeTestDatabase({ query }, settings, VERIFICATION_DATABASE)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects a resolved configuration mismatch before connecting', async () => {
    const query = vi.fn();
    await expect(assertScopeTestDatabase({ query }, valid, 'qorvenz_db')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('checks actual connection identity using only SELECT and rejects mismatches', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ database_name: 'qorvenz_db' }] });
    await expect(assertScopeTestDatabase({ query }, valid, VERIFICATION_DATABASE)).rejects.toThrow();
    expect(query.mock.calls).toEqual([['SELECT current_database() AS database_name']]);
  });
  it('accepts only the explicitly configured and actually connected test database', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ database_name: VERIFICATION_DATABASE }] });
    await expect(assertScopeTestDatabase({ query }, valid, VERIFICATION_DATABASE)).resolves.toBeUndefined();
    expect(query.mock.calls).toEqual([['SELECT current_database() AS database_name']]);
  });
});

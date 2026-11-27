export const VERIFICATION_DATABASE = 'qorvenz_verification_test';

interface DatabaseIdentityReader {
  query(sql: string): Promise<{ rows: { database_name: string }[] }>;
}

/** No default database names: opt-in tests must identify their disposable target explicitly. */
export async function assertScopeTestDatabase(
  database: DatabaseIdentityReader,
  settings: Record<string, string | undefined>,
  configuredDatabase: string,
): Promise<void> {
  if (settings.NODE_ENV !== 'test' || settings.SCOPE_INTEGRATION !== '1' ||
      settings.DB_NAME !== VERIFICATION_DATABASE || configuredDatabase !== VERIFICATION_DATABASE) {
    throw new Error('Scope tests require NODE_ENV=test, SCOPE_INTEGRATION=1 and explicit DB_NAME=qorvenz_verification_test.');
  }
  const result = await database.query('SELECT current_database() AS database_name');
  if (result.rows.length !== 1 || result.rows[0].database_name !== VERIFICATION_DATABASE) {
    throw new Error('Connected database is not the approved disposable verification database.');
  }
}

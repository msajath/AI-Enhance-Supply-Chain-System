
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const migrationDir = resolve('database/migrations');
const downDir = join(migrationDir, 'down');

const filenamePattern = /^\d{3}_[a-z0-9_]+\.sql$/;

const upFiles = readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const downFiles = readdirSync(downDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const failures = [];
const warnings = [];
const versions = new Map();

if (upFiles.length === 0) {
  failures.push('No SQL migration files were found.');
}

for (const filename of upFiles) {
  if (!filenamePattern.test(filename)) {
    failures.push(`Invalid migration filename: ${filename}`);
  }

  const content = readFileSync(join(migrationDir, filename), 'utf8');

  if (!content.trim()) {
    failures.push(`Empty migration file: ${filename}`);
  }

  const prefix = filename.split('_')[0];
  const previous = versions.get(prefix);

  if (previous) {
    warnings.push(
      `Migration prefix ${prefix} is shared by ${previous} and ${filename}`,
    );
  } else {
    versions.set(prefix, filename);
  }

  if (!downFiles.includes(filename)) {
    warnings.push(`No down migration exists for ${filename}`);
  }
}

for (const filename of downFiles) {
  if (!upFiles.includes(filename)) {
    failures.push(`Orphan down migration: ${filename}`);
  }

  const content = readFileSync(join(downDir, filename), 'utf8');

  if (!content.trim()) {
    failures.push(`Empty down migration: ${filename}`);
  }
}

console.log('=== QORVENZ MIGRATION PREFLIGHT ===');
console.log(`Up migrations: ${upFiles.length}`);
console.log(`Down migrations: ${downFiles.length}`);

for (const warning of warnings) {
  console.warn(`WARNING: ${warning}`);
}

for (const failure of failures) {
  console.error(`ERROR: ${failure}`);
}

if (failures.length > 0) {
  console.error('Migration preflight FAILED.');
  process.exitCode = 1;
} else {
  console.log('Migration file preflight PASSED.');
  console.log('Note: SQL execution and rollback safety are not verified.');
}

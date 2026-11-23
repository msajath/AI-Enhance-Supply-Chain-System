
# Qorvenz Tech — Database Migration and Recovery Guide

**Jira:** AESCS-31
**Database:** PostgreSQL
**Project:** AI-Enhanced Logistics Management System

## 1. Overview

Database migrations manage changes to the database schema.

This project uses SQL migration files and a TypeScript migration runner.
Each successfully applied migration is recorded in the
`schema_migrations` table.

The canonical project ERD must remain the reference for database design.

## 2. Migration Files

Forward migrations:

`database/migrations/`

Rollback migrations:

`database/migrations/down/`

Migration execution:

`scripts/migrate.ts`

Rollback planning and execution:

`scripts/rollback.ts`

## 3. Database Configuration

Database connection settings are provided using environment variables:

- DB_HOST
- DB_PORT
- DB_USER
- DB_PASSWORD
- DB_NAME
- DB_SSL

The default PostgreSQL port is 5432.

Do not commit database credentials, production connection strings,
or backup contents to GitHub.

## 4. Migration Preflight

Run:

`npm run db:migrations:check`

This command checks migration filenames, empty SQL files,
duplicate version prefixes, and rollback file coverage.

Warnings must be reviewed before deployment.

Passing this check does not prove that SQL migrations or their
rollback operations are safe.

## 5. Applying Database Migrations

Command:

`npm run db:migrate`

Before executing:

1. Verify the target database and environment.
2. Confirm that a suitable backup exists for important data.
3. Review new migration SQL files.
4. Test migrations in an isolated PostgreSQL environment.
5. Obtain approval for changes to shared databases.

The migration runner records successful migrations in
`schema_migrations` and skips previously applied filenames.

## 6. Rollback Safety

Automatic rollback execution is blocked by default.

Preview command:

`npm run db:rollback -- --plan`

This preview inspects migration history and checks whether a matching
down migration exists. It does not execute rollback SQL.

The preview requires a database with an existing
`schema_migrations` table.

Rollback execution requires explicit confirmation, and
production execution is disabled by the rollback script.

Do not execute destructive down migrations without
a verified backup and approved recovery procedure.

## 7. Current Migration Risks

The current project contains eight forward migrations and three
rollback migration files.

Some migrations have no matching down files.

The latest role-relationship migration,
`006_erd_role_relationship.sql`, has no down migration.

Several existing down migrations can delete data:

- `002_core_org_structure.sql` removes organization-related data.
- `005_access_requests.sql` drops the access requests table.
- `006_driver_portal.sql` deletes driver access requests and
  removes driver account relationships.

Existing migrations must not be renamed without coordinating with
the database owner and checking applied migration history.

## 8. Recovery Procedure

For a failed migration or database incident:

1. Stop further schema changes.
2. Record the failed migration and affected environment.
3. Notify the responsible developer or database administrator.
4. Verify the latest usable database backup.
5. Test a recovery on an isolated database.
6. Decide between a reviewed forward-fix and backup restoration.
7. Obtain approval before changing shared or production databases.
8. Verify schema integrity, application behavior, and access controls.
9. Record the recovery results and incident details.

Never restore a backup directly over a shared database without an
approved recovery plan.

## 9. CI/CD Integration

GitHub Actions runs:

- Migration file preflight
- TypeScript and ESLint validation
- Database migrations on an isolated PostgreSQL service
- Repeatable seed operations
- Database schema constraint checks
- Automated backend and frontend tests
- Production builds

The preflight does not perform destructive rollback testing.

## 10. Future Improvements

- Introduce unique numbering for future migrations.
- Add migration checksums.
- Document recovery plans for each new migration.
- Validate backup restoration in a disposable environment.
- Add automated non-destructive migration-history checks.

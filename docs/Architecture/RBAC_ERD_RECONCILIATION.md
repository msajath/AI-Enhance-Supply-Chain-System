# RBAC reconciliation and proposed ERD extension

Source: `erd.pdf`, supplied from Downloads and copied unchanged into this directory. Pages 2-3 show the access model; page 7 identifies it as a logical design whose SQL types and constraints still require definition. All seven pages were text-inspected, and the ROLE, APP_USER, USER_SCOPE areas and implementation notes were rendered for visual review.

## Confirmed relationships and physical mapping

| Logical ERD | Existing/implemented SQL | Decision |
|---|---|---|
| COMPANY.company_id | organizations.id | Keep deployed table and identifiers |
| ROLE.role_id, company_id, role_name, description | roles.id, organization_id, role_name, description | Added in migration 006 |
| APP_USER.user_id, company_id, role_id | users.id, organization_id, role_id | Added role FK; retain users.role as synchronized compatibility code |
| USER_SCOPE.user_id, project_id, site_id, warehouse_id | user_project_access, user_site_access, user_warehouse_access | Retain deployed scope implementation; do not add a second authority |
| AUDIT_EVENT.user_id | system_audit_logs.actor_id | Retain existing audit mechanism |

The role records are company-owned. Their normalized names are the 12 supported role identifiers, with the prior DRIVER value retained for historical accounts. Migration 006 seeds each existing company, backfills only users.role_id, enforces organization-qualified foreign keys, and seeds new companies automatically. An idempotent seed is also provided. A trigger keeps code-based existing API writes and identifier-based SQL writes consistent. Existing hashes, activation flags, role codes and scope grants are preserved. Historical users without an organization retain no role_id and remain denied organizational resource access.

The three physical scope tables are a documented compatibility mapping, not an exact reproduction of every possible USER_SCOPE tuple. They represent independent grants with project/site dependency checks. No correlated tuple semantics or new ownership grants are inferred from nullable ERD fields. Replacing them would require a separate migration plan.

The canonical model assigns **one role per user** through APP_USER.role_id. It contains no user-role join table. Multiple-role assignment and role switching are therefore outside this ERD; the current UI correctly exposes neither.

DRIVER_OPERATOR.user_id links a user to a driver identity in the ERD. The deployed fleet_drivers table lacks that link, and existing assignments lack delivery_id. Supplier has no user link even in the supplied ERD. Driver-owned delivery and supplier-owned portal transactions therefore remain denied/unavailable pending their business migrations. Scope grants alone must never substitute for those ownership links.

## Permission-model gap

None of the 64 logical tables is a permission catalog or a role-permission join. The 132-FK index confirms that there is no such relationship. Current effective permissions are centralized code policy. Introducing persistent permission relationships is an extension of this canonical ERD, rather than an implementation of an existing drawn relationship.

The master prompt, section 4, says: "Never modify the canonical ERD without explicitly identifying the required change and obtaining approval." The following proposal is reviewable design only. It has **not** been applied or added as an executable migration.

## Proposed extension for approval

Add two logical tables and two foreign-key relationships (66 logical tables / 134 relationships), without adding multiple-role assignments:

```sql
CREATE TABLE permissions (
 code text PRIMARY KEY CHECK (length(trim(code)) > 0),
 description text NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
 role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
 permission_code text NOT NULL REFERENCES permissions(code) ON DELETE RESTRICT,
 PRIMARY KEY (role_id, permission_code)
);
```

`roles` remains company-owned; a grant's company is obtained through its role. There are no duplicate permission assignments or role catalogs. Retain the existing dot-separated permission codes and seed exactly the reviewed matrix in `backend/src/auth/permissions.ts`, including dashboard access. No user accounts or passwords change. Never use a wildcard ADMIN bypass.

After approval, the implementation would:

1. Add migration 007 and an idempotent seed for permission records and company role assignments. Seed future companies consistently.
2. Load effective permissions from the user's normalized role on every authenticated request. A lookup error returns a safe 503; an empty grant set denies access. Do not fall back to code grants when the database lookup fails.
3. Return that same effective set from login, session restoration, context and admin inspection. Use it for backend permission middleware and frontend navigation, retaining scope and ownership checks separately.
4. Keep assignment changes and audit writes transactional. Existing role changes revoke credentials; database permission changes take effect on the next protected request through fresh reads.
5. Test grant removal/addition, empty permissions, tenant isolation, disabled/revoked sessions, existing three-role workflows, and seeded-policy parity against PostgreSQL.

This proposal deliberately leaves user_roles out: adding it is unnecessary for the approved single-role model. Approval of these two permission tables would not authorize supplier-user ownership or delivery schema changes.

## Verification

`node scripts/verify-role-migration.cjs` applies migrations 001-006 in an isolated PGlite PostgreSQL engine, inserts a pre-migration account, verifies its role/hash preservation and role_id backfill, then executes `database/tests/006_role_relationship.test.sql`. Assertions cover repeatable seeding, automatic new-company catalogs, role-code/ID synchronization, cross-company assignment rejection, conflicting assignment rejection, duplicate rejection, assigned-role delete/rename protection and retained inactive legacy accounts. The SQL assertions run in a rolled-back transaction and can also run on a disposable server database.

The optional validation dependency is installed only under ignored `tmp/rbac-validation`; application dependencies and lockfiles are unchanged. This is PostgreSQL SQL/trigger validation, not the opt-in HTTP/session integration suite against a network PostgreSQL service. Docker Desktop remains unavailable. No developer/production database has been migrated.

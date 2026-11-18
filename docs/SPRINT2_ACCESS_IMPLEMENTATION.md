# Sprint 2 access foundation - implementation and verification

## Audit and compatibility

The checked-out `developer2` branch uses `backend/` and `frontend/`. README references to `apps/api` were stale. No AGENTS.md or agreed Sprint 2 backlog was found. The supplied 64-table, 132-relationship ERD is now archived at docs/Architecture/erd.pdf and reconciled in docs/Architecture/RBAC_ERD_RECONCILIATION.md. Migration 006 implements its single-role relationship without changing the canonical ERD.

Existing features retained: central email/password login, bcrypt hashing, signed HS256 JWTs, PostgreSQL-backed HttpOnly cookie sessions, origin checks, disabled-account enforcement, auth_version revocation, organization isolation, explicit project/site/warehouse grants, the Admin/Fleet/Warehouse dashboards, user provisioning, last-administrator protection, fleet workflows, and stock workflows. Existing API paths and three existing role identifiers remain unchanged. The single-role model is retained: the supplied ERD has APP_USER.role_id pointing to ROLE, and has no user-role join relationship. The `roles` response array currently has one entry and is not a promise of multi-role assignment support.

Corrections: changing scope grants now increments auth_version; login's access-request message no longer falsely claims submission; auth responses and role configuration accept all 12 business categories; new read-only workspaces do not inherit write controls.

## Roles, dashboards, and effective permission matrix

Permission identifiers retain the existing dot-separated convention. Every role additionally has `dashboard.<prefix>.read`. These are centrally maintained server policies, not browser-submitted grants. Permissions describing future business operations reserve policy identifiers; they do not implement corresponding endpoints.

| Role | Dashboard | Permissions (excluding dashboard access) |
|---|---|---|
| ADMIN | `/admin/dashboard` | `users.read`, `users.create`, `users.update`, `users.deactivate`, `projects.read`, `projects.manage`, `sites.manage`, `warehouses.read`, `warehouses.manage`, `audit.read`, `settings.manage` |
| FLEET_MANAGER | `/fleet/dashboard` | `projects.read`, `fleet.vehicles.read`, `fleet.vehicles.manage`, `fleet.drivers.manage`, `fleet.assignments.manage`, `fleet.maintenance.manage`, `fleet.fuel.manage`, `fleet.reports.read` |
| WAREHOUSE_MANAGER | `/warehouse/dashboard` | `projects.read`, `warehouses.read`, `inventory.read`, `inventory.receive`, `inventory.issue`, `inventory.transfer`, `inventory.adjust`, `inventory.count`, `inventory.return` |
| SUPPLY_CHAIN_MANAGER | `/management/dashboard` | `projects.read`, `inventory.read`, `fleet.vehicles.read`, `fleet.reports.read`, `reports.read`, `requisition.approve`, `purchase_order.approve` |
| PROCUREMENT_OFFICER | `/procurement/dashboard` | `projects.read`, `requisition.read`, `requisition.create`, `requisition.update`, `requisition.submit`, `rfq.create`, `quotation.read`, `quotation.evaluate`, `purchase_order.create` |
| LOGISTICS_COORDINATOR | `/logistics/dashboard` | `projects.read`, `transport_request.read`, `transport_request.create`, `delivery.read`, `delivery.assign`, `delivery.update` |
| PROJECT_MANAGER | `/project/dashboard` | `projects.read`, `requisition.read`, `requisition.create`, `requisition.submit`, `delivery.read` |
| SITE_STOREKEEPER | `/site/dashboard` | `projects.read`, `inventory.read`, `stock_movement.read`, `site_receipt.confirm` |
| FINANCE_OFFICER | `/finance/dashboard` | `finance.read`, `cost_report.read`, `cost_report.export`, `reports.read`, `reports.export` |
| DRIVER_OPERATOR | `/driver/dashboard` | `delivery.assigned.read`, `delivery.assigned.update`, `proof_of_delivery.submit` |
| SUPPLIER_USER | `/supplier/dashboard` | `rfq.supplier.read`, `quotation.supplier.submit`, `purchase_order.supplier.read` |
| AUDITOR | `/auditor/dashboard` | `projects.read`, `inventory.read`, `fleet.vehicles.read`, `fleet.reports.read`, `reports.read`, `audit.read` |

Admin retains organization-wide access only within its own organization. All other roles require explicit project/site/warehouse grants for the existing shared operational read APIs. Supply chain managers and auditors do not gain automatic company-wide resource access. Driver and supplier roles receive no generic fleet/inventory permissions. No personally assigned delivery or supplier-owned record APIs are introduced because the deployed schema does not contain those user-to-resource relationships. Such operations remain unavailable, rather than inferring identity from email or project membership.

## Database changes and preservation

`005_sprint2_role_categories.sql` extends `users_role_check` and adds a case-insensitive unique email index; it does not add tables or relationships, rewrite account roles, reactivate accounts, change passwords, or delete data. The versioned migration runner executes it transactionally and skips already applied migrations. The constraint replacement itself is repeatable. Existing case-colliding emails make the migration fail transactionally; they must be reviewed without deleting records automatically. Migration 006 adds the verified company-owned roles table, users.role_id and its organization-qualified FK, backfills existing assignments, and synchronizes the legacy users.role code through a trigger. It seeds the 12 supported categories plus historical DRIVER for each company, with unique company/name constraints and automatic new-company seeding. The role API now reads company role records. database/seeds/003_sprint2_role_catalog.sql is repeatable and creates no users. No permission tables appear in the supplied ERD, so permission policy remains in code pending the documented schema-extension approval.

The old `DRIVER` value remains legal for historical records. Migration 004 previously disabled those accounts; this migration deliberately leaves their role and status intact. They remain unsupported for login until an administrator explicitly changes their role to DRIVER_OPERATOR and decides whether to reactivate them. No accounts are automatically remapped. Migration 003's earlier legacy mappings cannot be reconstructed by this change.

Existing relationships: users.organization_id -> organizations.id; user_project_access, user_site_access, and user_warehouse_access reference users and resources with organization-qualified foreign keys; system_audit_logs.actor_id -> users.id. The supplied ERD confirms single-role assignment. Persistent permissions require the two-table extension proposed in docs/Architecture/RBAC_ERD_RECONCILIATION.md. No parallel authorization schema or speculative associations were introduced.

## Login and authorization

The one login page posts credentials to `/api/v1/auth/login`. Backend bcrypt verification uses an equal-cost dummy comparison for unknown accounts. Public signup remains denied. The optional legacy portal hint can only restrict a login; it cannot assign a role. React uses the HttpOnly, SameSite cookie and stores no access tokens. API clients can use the returned JWT, whose issuer, audience, signature algorithm and expiration are verified.

Authenticated operations reload user status, organization, role and auth_version from PostgreSQL. Client-supplied roles or JWT role claims do not authorize operations. `permit` (also exported as `requirePermission`) denies unlisted permissions. Existing operational queries restrict data by organization plus explicit grants. Authentication failures return 401, permission/scope failures return 403, and database outages return safe 503 responses. Role changes, identity updates, disable/reactivate, password resets, logout, and scope changes increment auth_version, invalidating old cookies and JWTs on their next protected request. Other already authenticated requests can finish; there is no claim of cancelling in-flight transactions. Frontend session refresh occurs on focus and every 60 seconds, with immediate expiration on a protected API's 401.

Each dashboard requires its explicit dashboard permission and matching server-assigned role. Navigation is filtered by effective permissions. Existing labels are kept for API compatibility, with additive roleCode, roles, permissions, and dashboard response fields. `/context` supplies authorized scope data. No role switcher is exposed because only one role assignment is supported by the verified model.

Existing admin, fleet and warehouse dashboard metrics still use their original scoped database queries. Nine new dashboards return empty collections and an explicit future-module flag, never fabricated statistics. Supply chain managers and auditors reuse read-only inventory, movement, vehicle and fleet report views; storekeepers reuse scoped inventory and movement views. Auditors also have the organization-scoped `/api/v1/review/audit` read API. All business writes remain protected server-side. Full procurement, finance, delivery, supplier, and approval modules are not implemented here.

## Administration

1. Sign in with an existing active ADMIN account.
2. Open `/admin/users`. Search/filter existing accounts or create one with a unique email, full name, role, and password of at least 12 characters (maximum 72 UTF-8 bytes).
3. Edit the role and activation status through the existing editor. The API rejects ordinary-user provisioning and self-demotion/self-disable, and serializes last-active-administrator checks with an organization row lock.
4. Choose Access and assign project/site/warehouse grants. Sites require their projects; site warehouses require their sites. Cross-organization grants are rejected. All prior sessions for that account are revoked when access changes.
5. Review `/admin/roles` for effective permissions and `/admin/audit` for USER_CREATED, USER_UPDATED, ACCESS_ASSIGNED and password-reset history. User updates record role before/after values. Role removal means replacing the single role or disabling the account; there is no role deletion API.

Admin APIs: GET `/admin/users`, GET `/admin/roles`, POST `/admin/users`, PATCH `/admin/users/:id`, POST `/admin/users/:id/password`, PUT `/admin/users/:id/access`, GET `/admin/audit`. All require the existing administration policy; no password hashes are returned.

## Validation

The implementation report below records executed commands. Database integration suites are opt-in and are not equivalent to mocked route tests. No production or developer records were modified during this task. Live migration verification was unavailable: the configured PostgreSQL endpoint returned ECONNREFUSED and `docker version` reported the Docker Desktop Linux engine named pipe missing.

Automated coverage includes all 12 role logins and their returned policies; nine new dashboard authentication and role isolation checks; driver, supplier, procurement and auditor mutation denial; disabled/revoked sessions; procurement creator/approver separation in policy; all 12 frontend restoration routes; blocked auditor administrative navigation; and read-only auditor inventory controls. Existing tests cover invalid/expired JWTs, password failures, unknown/disabled accounts, logout, CSRF origins, role tampering and project isolation. No claim is made of live driver ownership, supplier ownership, multi-role resolution or working procurement approvals. The ERD includes a driver-user link not yet deployed; it has no supplier-user link or multiple-role assignment relationship.

## Local verification

1. Start Docker Desktop and confirm the database connection settings match the mapped PostgreSQL port. `npm run docker:up` starts the existing local service.
2. Run `npm run db:migrate` against the intended local database; this runs any pending older migrations too. Review those separately when upgrading an older database: migration 003 and 004 predate this change and contain role/status transformations.
3. Run `npm run dev` and sign in with an existing administrator. No credentials or privileged demo accounts are added by this change.
4. Create accounts for each role, assign appropriate grants, sign in through `/login`, and verify the routes in the matrix. Apply both migrations 005 and 006 before using this version, including the database-backed role catalog.
5. As auditor, verify that shared views are read-only. As driver/supplier, verify warehouse/fleet/admin API requests are denied. Change roles/scopes or disable an account and verify its previous session returns 401.
6. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
7. For database-backed workflows, use an isolated disposable database named `qorvenz_management_test`, apply all migrations with DB_NAME set to that database, and run `$env:MANAGEMENT_INTEGRATION='1'; npm run test:api`. The existing integration suite enforces this database name. Never target a team/production database. It inserts test records and is not a cleanup runner.

## Remaining dependencies and future modules

The ERD has now been supplied and visually reconciled. Its ROLE -> APP_USER relationship is implemented by migration 006; its single-role model is retained. The agreed Sprint 2 backlog is still unavailable. Permission records and role-permission assignments are not in this ERD: a concrete two-table extension awaits approval in docs/Architecture/RBAC_ERD_RECONCILIATION.md. This remains a 12-category access foundation, not the complete database-managed permission system from the master prompt. Business ownership checks and operations must be implemented with their actual business migrations; unavailable procurement, supplier, finance and delivery operations remain unavailable.

## Executed checks and results

| Command / check | Result |
|---|---|
| `npm test` (initial regression run) | 61 backend and 30 frontend passed; 22 database integration tests skipped |
| `npm run test:api` (final backend run) | 92 passed, 22 integration tests skipped |
| `npm run test:web` (expanded frontend coverage) | 44 passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; Vite warns about a JavaScript chunk larger than 500 kB |
| `git diff --check` | Passed |
| Read-only configured PostgreSQL connection | Failed with ECONNREFUSED; no migration applied |
| `docker version` | Failed: Docker Desktop Linux engine named pipe unavailable |

One newly added frontend assertion initially failed because it omitted the actual `withCredentials` argument; the assertion was corrected and the expanded suite passed. No application defect was masked by removing a test. The backend prints the existing Vite CJS deprecation warning; the production web build emits a bundle-size warning. Neither is a failed check.

## Created and modified files

| File | Change |
|---|---|
| `backend/src/auth/permissions.ts` | 12-role catalog, dashboard mapping, central policies and permission lookup |
| `backend/src/middleware/authorize.ts` | Audited permission-denial reason |
| `backend/src/modules/management/shared.ts` | Fail-closed permission helper, exported requirePermission alias, denial auditing |
| `backend/src/routes/auth.routes.ts` | All-role login/session support and additive effective-access metadata |
| `backend/src/routes/admin.routes.ts` | Scope changes revoke previous credentials; existing catalog-driven management now lists all roles |
| `backend/src/routes/management.routes.ts` | Protected new dashboards, permission-filtered context and auditor audit API |
| `backend/tests/sprint2-rbac.test.ts` | New all-role authentication and security regression coverage |
| `backend/tests/management.integration.test.ts` | Expected catalog expanded from 3 to 12 roles |
| `database/migrations/005_sprint2_role_categories.sql` | Safe role constraint extension and unique email index |
| `frontend/src/services/roles.ts` | Typed role and route catalog, without frontend permission grants |
| `frontend/src/services/auth.ts` | Parse all role labels and retain server policy metadata |
| `frontend/src/App.tsx` | Shared protected workspaces, dynamic navigation and honest future-module view |
| `frontend/src/pages/managementConfig.ts` | All-role admin choices, reused read-only resources, navigation permission keys |
| `frontend/src/pages/Management.tsx` | Avoid loading write-editor references for read-only views |
| `frontend/src/pages/Login.tsx` | Correct the unsubmitted access-request message |
| `frontend/src/App.test.tsx` | All-role routing, forbidden admin routes and read-only controls |
| `README.md` | Link to this report |
| `docs/SPRINT2_ACCESS_IMPLEMENTATION.md` | Audit, matrix, schema limitations, validation and local verification |

## ERD reconciliation follow-up

Added migration 006, repeatable role seed 003, SQL relationship assertions, an optional isolated PostgreSQL validation runner, and a company-filtered database-backed admin role catalog. Copied the supplied PDF byte-for-byte over the prior empty repository placeholder. See Architecture/RBAC_ERD_RECONCILIATION.md for the logical-to-physical mapping, confirmed single-role cardinality, scope compatibility limits, missing ownership relationships, and the exact permission-table proposal requiring approval.

Additional changed files: `database/migrations/006_erd_role_relationship.sql`, `database/seeds/003_sprint2_role_catalog.sql`, `database/tests/006_role_relationship.test.sql`, `scripts/verify-role-migration.cjs`, `docs/Architecture/erd.pdf`, and `docs/Architecture/RBAC_ERD_RECONCILIATION.md`.

Validation: `node scripts/verify-role-migration.cjs` passed all six migrations and role relationship assertions. The initial SQL test caught RESTRICT's integrity-constraint exception too narrowly; it was corrected to catch the constraint class and rerun successfully. No SQL restriction was relaxed. Network PostgreSQL integration tests remain opt-in/skipped; embedded SQL verification does not replace them.

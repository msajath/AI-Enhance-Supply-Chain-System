# Sprint 1: Jira Coverage & Evidence

**Date:** 2026-11-05 · **Scope:** the Sprint 1 tickets in Jira (AESCS-40…46 and their subtasks) plus the handbook's Sprint 1 cards (Days 001–010).
**How to read this:** ✅ = done and verified · 🟡 = done, verified here, still needs a human step (PR review / CI run / mentor) · ⏳ = needs a human event only.

> **Verification note.** The npm registry was unreachable in the authoring environment, so `npm install` could not run.
> - **Database:** migrations, seed and rollback were run for real against PostgreSQL 16.
> - **API tests:** run with a vitest-compatible runner, against express, supertest, jsonwebtoken, express-session and pg built from their GitHub sources at the lockfile versions.
> - **Frontend:** typechecked, then tested in a real Chromium browser.
>
> CI re-runs everything with the real toolchain, and **that CI run is the evidence to attach in Jira** (see "Commands" below).

---

## 1. Ticket → deliverable → evidence

| Jira | Owner | Ticket | Status | What was delivered | Evidence |
| :--- | :--- | :--- | :-: | :--- | :--- |
| *(story, ID not in screenshot)* | M1 | **Implement role guard and project-scope middleware** | 🟡 | `apps/api/src/middleware/authorize.ts`: `requireRole(...)`, `requireProjectAccess(...)`, `recordAccessDenied()`. `apps/api/src/middleware/authenticate.ts`: `requireAuth` (cookie **or** Bearer JWT, role and company re-read from DB). `apps/api/src/auth/permissions.ts`: role list and permission sets. | AC1 *403 for unauthorized role/project*: `authorize.test.ts` (15 ✓), `organization.routes.test.ts` (18 ✓). AC2 *GET /projects & /sites enforce scope + log denials*: same files + `scope.integration.test.ts` (7 ✓, real SQL). Denials are written to `system_audit_logs` (`event_type='ACCESS_DENIED'`, `module='authz'`). AC3: PR review ⏳ |
| ↳ subtask | M1 | Implement role authorization middleware | 🟡 | `requireRole` returns **403 FORBIDDEN** + audit row; 401 if not signed in | `tests/authorize.test.ts` › *requireRole* |
| ↳ subtask | M1 | Implement project scope access checks | 🟡 | `requireProjectAccess` checks company **and** `user_project_access` grant; same 403 for unknown and foreign IDs (no probing); malformed IDs → 400 | `tests/authorize.test.ts` › *requireProjectAccess*, `tests/scope.integration.test.ts` |
| AESCS-40 | M2 | **Create company, project, site and department relational schema** | 🟡 | `database/migrations/002_core_org_structure.sql`: `projects`, `sites`, `departments` (+ `organizations` = company). PK, FK, NOT NULL, CHECK, UNIQUE, **composite tenant FKs** so a row can never point at another company's parent. Lookup indexes. | AC1 *PK/FK/unique work*: `database/tests/002_core_org_structure.test.sql`, **25/25 PASS** on PostgreSQL 16 (`test-runs/01-database.txt`). AC2 *indexes*: same test checks 7 indexes. |
| ↳ subtask | M2 | Write company, project, site and department migrations | 🟡 | as above + **rollback** `database/migrations/down/002_core_org_structure.sql` and `npm run db:rollback` (`scripts/rollback.ts`) | migrate → rollback → re-migrate cycle in `test-runs/01-database.txt` |
| AESCS-160 | M2 | Add warehouse and user project access foundation | 🟡 | `warehouses` gains `warehouse_type` (CENTRAL/REGIONAL/SITE), `site_id`, `is_active`; new `user_project_access`, `user_warehouse_access` tables | constraint test: cross-company grants rejected (23503), duplicate grants rejected, cascade on user delete |
| AESCS-41 | M2 | **Seed representative projects, sites, users and warehouses** | 🟡 | `database/seeds/002_sprint1_org_structure.sql` + `scripts/seed.ts`, implementing the **Sprint 1 fixture plan** (`docs/sprint-01/09` §1, D-012): PRJ-GAL Galle Road Apartments, PRJ-MAT Matara Bridge Rehabilitation, SITE-GAL-01, SITE-MAT-01, WH-CEN (central), WH-MAT (site store), 4 departments, and the planned users whose roles exist (`@demo.qorvenz.test`) | AC1 *repeatable, IDs reference existing rows*: 2 seed runs give identical counts; parents are referenced by **code**, not hard-coded IDs. AC2 *visible with test login*: **real** end-to-end login as each seed user (`test-runs/04-real-end-to-end.txt`, 19/19) |
| AESCS-161 | M2 | Create repeatable sample-data seed script | ✅ | Re-runs add nothing. **No shared demo passwords:** every user gets their own random password (or one from `SEED_PASSWORD_*` env vars), printed once. The old `admin@qorvenz.local` account with the published shared password is **disabled** on the next seed, and logging in with it is rejected. Refuses to run in production. | `test-runs/01-database.txt` (5 active users, 5 distinct hashes, legacy account disabled), `04-real-end-to-end.txt` |
| AESCS-42 | M3 | **Build project and site read-only listing pages** | 🟡 | `frontend/src/pages/Projects.tsx`, `Sites.tsx`, `orgShared.tsx`, `services/organization.ts`; menu items for Admin and Warehouse manager only | AC1 *users see allowed projects & sites*: server decides (403/scoped lists); UI only shows what it returns. AC2 *loading/empty/error*: browser checks + `ProjectsSites.test.tsx` |
| AESCS-162 | M3 | Build project list UI with API loading states | 🟡 | Skeleton loading (`aria-busy`, screen-reader status), empty state, safe error + **Try again**, client search, responsive cards on phones | `test-runs/03-web-browser-checks.txt` (23/23 PASS), screenshots `screenshots/projects-*.png` |
| AESCS-163 | M3 | Build site list UI with project filter | 🟡 | Filter only lists projects the server returned; filter sent as `?projectId=` and **re-checked by the server**; "View sites" from a project opens the filtered list | browser checks: *other project's sites do not appear*, *403 shows an access message*; `screenshots/sites-*.png` |
| AESCS-45 | M4 | **Document AI tool permissions, evidence fields and no-write policy** | 🟡 | `docs/architecture/ai-permissions-and-safe-tools.md`, `docs/architecture/ai-evidence-and-review-data.md` | Acceptance = *documented and reviewed*: documents done; sign-off tables at the end of each ⏳ |
| AESCS-164 | M4 | Write AI permissions and safe-tool architecture | 🟡 | Role-scoped **read-only** tool registry, zod input/output validation, prohibited list (no SQL, no writes, no approvals, no key in frontend), limits, fallback, kill switch | the document |
| AESCS-165 | M4 | Define AI evidence and review data requirements | 🟡 | `ai_request`, `ai_tool_call`, `ai_recommendation`, `ai_review` field lists; "no orphan figures" rule; retention; AI key backend-only | the document |
| AESCS-46 | M4 | **Write API and authorization smoke tests for Sprint 1** | 🟡 | `apps/api/tests/smoke.test.ts` + repeatable commands below | 13/13 ✓ in `test-runs/02-api-tests.txt`. *Test results attached* = CI artifact `api-test-results` ⏳ |
| AESCS-166 | M4 | Write health and authentication smoke tests | 🟡 | GET /health, login success/failure, unknown e-mail, **missing / expired / tampered / wrong-audience tokens** on `/auth/me` and `/projects` | `smoke.test.ts` |
| AESCS-167 | M4 | Test cross-project restrictions and save CI evidence | 🟡 | Cross-project + cross-company tests (mocked DB **and** real PostgreSQL); CI now migrates, seeds twice, runs the SQL constraint test, runs API tests with `SCOPE_INTEGRATION=1` and **uploads JUnit results** | `.github/workflows/ci.yml`; first green CI run = evidence ⏳ |

**Totals verified (double-checked on 2026-11-05 from the files on the team's computer):**

* **Database:** 25 SQL constraint checks; fresh-install, upgrade and rollback paths.
* **API:** **66** tests. That is 54 new plus 12 existing auth/health/real-session tests, all still passing after the session refactor.
* **Web unit tests:** **30**. That is 20 existing `App.test.tsx` plus 10 new, run with the team's installed Testing Library + jsdom.
* **Browser:** 23 mocked-API checks plus **19 real end-to-end checks** (real API server, real PostgreSQL, real login form).
* **Typecheck and lint:** TypeScript 5.9.3 typecheck clean for API, scripts and web (web incl. tests). ESLint reports 0 problems for both apps.

## 2. Handbook Sprint 1 (Days 001–010)

All 40 written cards were already done: see `docs/sprint-01/00-SPRINT-01-STATUS.md`. Still needed from people: Day 002 stakeholder interviews, peer-review links, Day 010 mentor review, and creating the epics in Jira (now done by the team, since the AESCS tickets exist).

## 3. Decisions taken while implementing (added to `docs/decision-log.md`)

* **D-014:** Out-of-scope projects return **403** (as the Jira AC says), identical for unknown IDs so IDs can't be probed.
* **D-015:** Project/site read = ADMIN (company-wide) + WAREHOUSE_MANAGER (granted projects only). Driver has none. Follows matrix row "Company / project / site / warehouse setup".
* **D-016:** `organizations` stays the company table (Q-401 still open); composite `(id, organization_id)` FKs enforce tenant safety in the database.
* **D-017:** Seed users get individual passwords; shared demo passwords are rotated.
* **D-019:** The seed follows the Sprint 1 fixture plan (D-012). The company and central warehouse reuse the records from the 001 seed, and users are created only for roles that exist (Q-402).
* **D-018:** File locations follow the repo's existing layout, not the Jira examples. The Jira text suggested `apps/api/migrations/001_core.sql`, `apps/api/src/db/seed.ts` and `apps/web/src/pages/`. The repo uses `database/migrations/002_…`, `scripts/seed.ts` and `frontend/src/pages/`. `001` was already shared, so a new numbered file is required (D-009).

## 4. Commands (repeatable)

```powershell
# one-time
npm install                       # installs API + web deps (API deps were not installed on this machine yet)
docker compose up -d              # PostgreSQL on 5434 (see .env)

# database
npm run db:migrate                # applies 002_core_org_structure.sql
npm run db:seed                   # prints each new user's password ONCE; safe to re-run
npm run db:rollback               # undo the newest migration (dev only)
psql "postgresql://qorvenz_user:<pw>@localhost:5434/qorvenz_db" -v ON_ERROR_STOP=1 -f database/tests/002_core_org_structure.test.sql

# tests
npm run test:api                                   # all API tests (integration tests skip unless enabled)
$env:SCOPE_INTEGRATION="1"; npm run test:api       # + real-PostgreSQL scope tests (needs migrate + seed)
npm run test:ci --workspace=apps/api               # same, with JUnit report in apps/api/test-results/
npm run test:web                                   # frontend tests incl. ProjectsSites.test.tsx
npm run typecheck; npm run lint; npm run build

# try it
#   storekeeper.mat@demo.qorvenz.test → Projects shows only "Matara Bridge Rehabilitation"; GAL project → 403
#   warehouse.cen@demo.qorvenz.test   → both projects (granted), scoped label
#   admin@demo.qorvenz.test           → both projects, both sites, company-wide
#   driver.1@demo.qorvenz.test        → no Projects/Sites menu; GET /api/v1/projects → 403
#   admin@qorvenz.local (old shared password) → rejected; account disabled by the seed
```

## 5. What a human still has to do to close the tickets

1. `npm install`, then `npm run typecheck && npm run lint && npm test` on one laptop. Fix anything the real toolchain flags.
2. Open **one PR per member** (or one PR with four reviewers) and link it in each ticket (AC3 on every story).
3. Let CI run, then attach the `api-test-results` artifact and the screenshots in `evidence/sprint-01/screenshots/` to AESCS-46 / AESCS-42.
4. Reviewers fill in the sign-off tables in the two AI documents (AESCS-45).
5. Move tickets to Done.

## 6. Double-check (2026-11-05, second pass)

Re-verified from a fresh copy of the files **on the team's computer**, from an empty database. Each AC/DoD line on every Jira card was checked against code and evidence.

**Found and fixed in this pass**
1. **Seed didn't follow the Sprint 1 fixture plan** (`09` §1, D-012). It used other project, site and user names. It now seeds PRJ-GAL / PRJ-MAT, SITE-GAL-01 / SITE-MAT-01, WH-CEN / WH-MAT and the plan's `@demo.qorvenz.test` users, including the `storekeeper.mat` cross-project denial case (D-019).
2. **The old shared-password admin** (`admin@qorvenz.local`) is now disabled rather than kept, and a login attempt with it is rejected (verified end to end).
3. **Lint:** one ESLint warning (`react-refresh/only-export-components`) fixed by moving `formatDate` to `pages/format.ts`.
4. **Frontend tests:** the unit tests hadn't been executed in the first pass. Now 30/30 pass, with the team's installed Testing Library + jsdom.

**Honest remaining gaps (cannot be closed from here)**

| # | Gap | Why | What to do |
| :- | :--- | :--- | :--- |
| G1 | Tests not yet run with **real vitest** / CI | npm registry unreachable here; a vitest-compatible runner was used | Run `npm install && npm test` once; push the branch so CI runs. Attach the `api-test-results` artifact (AESCS-46/167) |
| G2 | "Location checks where relevant" (DoD): warehouse-level guard not built | `user_warehouse_access` exists, but Sprint 1 has no warehouse endpoints to protect | Add `requireWarehouseAccess` with the first warehouse/stock endpoint (Sprint 2–3), same pattern as `requireProjectAccess` |
| G3 | PR review link on every card and story (AC3) | Needs GitHub PRs and reviewers | Open PRs, link them in Jira and in the 40 `evidence/.../notes.md` files |
| G4 | AI documents "reviewed" (AESCS-45) | Needs human reviewers | Fill in the sign-off tables at the end of both docs |
| G5 | Handbook Day 002 interviews, Day 009 cross-review, Day 010 mentor review | Human events | Record answers in `02`, `10` §3, `11` §3 |
| G6 | Fixture-plan users for roles that don't exist yet (exec, procurement, logistics, fleet, site engineer, finance, auditor) | Roles pending Q-402 | Add to `scripts/seed.ts` when the roles are added |
| G7 | Jira's suggested file paths differ | Repo layout already existed (D-018) | Mention D-018 in the PR description |

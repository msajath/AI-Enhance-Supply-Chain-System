# Sprint 1: How to Run Everything and Close It in Jira

**For:** all four members · **Machine:** Windows 11 + VS Code + PowerShell · **Repo:** `msajath/AI-Enhance-Supply-Chain-System`
**Goal:** get the system running on your laptop, prove every Sprint 1 ticket works, push it through pull requests + CI, and move every Jira ticket to **Done**.

> Work through Parts A → E in order. Each step ends with **✅ Expected**, which tells you what you should see. If you don't see it, check Part F (Troubleshooting).

---

## Part A — One-time setup (≈ 15 min, every member)

### A1. Install the tools

| Tool | Check in PowerShell | Get it |
| :--- | :--- | :--- |
| Node.js 22 LTS | `node -v` → v22.x | nodejs.org |
| Git | `git --version` | git-scm.com |
| Docker Desktop (running) | `docker --version` | docker.com |

### A2. Get the code

```powershell
cd D:\Projects\AI-Enhance-Supply-Chain-System
git fetch origin
git status            # note your current branch
```

### A3. Create your `.env`

```powershell
Copy-Item .env.example .env
code .env
```

In `.env`, set at least:

```ini
SESSION_SECRET=<any random text, 32+ characters>     # e.g. run: -join ((48..122) | Get-Random -Count 40 | % {[char]$_})
# Optional, so you know the demo passwords (otherwise the seed prints random ones once):
SEED_PASSWORD_ADMIN=<your own password>
SEED_PASSWORD_WAREHOUSE_CEN=<your own password>
SEED_PASSWORD_STOREKEEPER_MAT=<your own password>
SEED_PASSWORD_DRIVER_1=<your own password>
SEED_PASSWORD_DRIVER_2=<your own password>
```

Keep `DB_PORT=5434` and `POSTGRES_PORT=5434` as they are. **Never commit `.env`** (it is git-ignored).

### A4. Install dependencies

```powershell
npm install
```

✅ Expected: finishes with "added … packages". No `ERR!` lines. (The API packages such as express and pg were **never installed** on our machine before, so this step is required.)

---

## Part B — Database (≈ 5 min)

### B1. Start PostgreSQL

```powershell
docker compose up -d
docker ps --filter name=qorvenz_postgres
```

✅ Expected: `qorvenz_postgres` with status `Up … (healthy)` and port `0.0.0.0:5434->5432`.

### B2. Create the tables

```powershell
npm run db:migrate
```

✅ Expected: `Applying migration: 002_core_org_structure.sql` → `Migration complete. Newly applied: 1` (or 2 on a brand-new DB).

### B3. Load the demo data

```powershell
npm run db:seed
```

✅ Expected: a box titled **"New local login credentials (shown ONCE)"** listing:

| User | Role | Can see |
| :--- | :--- | :--- |
| `admin@demo.qorvenz.test` | Admin | both projects (whole company) |
| `warehouse.cen@demo.qorvenz.test` | Warehouse manager | PRJ-GAL + PRJ-MAT |
| `storekeeper.mat@demo.qorvenz.test` | Warehouse manager | **only** PRJ-MAT (cross-project test user) |
| `driver.1@demo.qorvenz.test`, `driver.2@…` | Driver | no projects |

If you didn't set `SEED_PASSWORD_*`, **copy the random passwords now** (they are only shown once).
If your DB had the old `admin@qorvenz.local` account, you will also see `DISABLED (used the old shared password…)`. That is expected.

Run it a second time:

```powershell
npm run db:seed
```

✅ Expected: `Users already exist; passwords unchanged.` (proves AESCS-161 "rerun without duplicates").

### B4. Check the database rules (AESCS-40/160 evidence)

```powershell
Get-Content database\tests\002_core_org_structure.test.sql | docker exec -i qorvenz_postgres psql -U qorvenz_user -d qorvenz_db -v ON_ERROR_STOP=1
```

✅ Expected: 25 lines containing `NOTICE:  PASS:`, then `ALL 002 CONSTRAINT TESTS PASSED (transaction rolled back, no data kept)`. Nothing is saved, so this is safe to run any time.

### B5. Check rollback (AESCS-40 subtask "rollback tested")

```powershell
npm run db:rollback     # ✅ "Rolled back 002_core_org_structure.sql"
npm run db:migrate      # ✅ re-applies 002
npm run db:seed         # ✅ "passwords unchanged" (grants are re-created)
```

---

## Part C — Automated checks (≈ 5 min)

Run each line and check its result:

```powershell
npm run typecheck                               # ✅ no errors (API + web)
npm run lint                                    # ✅ no errors
npm run test:api                                # ✅ all pass; 2 integration files show as "skipped"
$env:SCOPE_INTEGRATION="1"; npm run test:api; Remove-Item Env:SCOPE_INTEGRATION
                                                # ✅ all pass incl. scope.integration (real DB + seed data)
npm run test:web                                # ✅ 30 tests pass (App + ProjectsSites)
npm run build                                   # ✅ API compiled to apps/api/dist, web to frontend/dist
```

Optional JUnit report (same as CI): `npm run test:ci --workspace=apps/api` → `apps/api/test-results/junit.xml`.

> If anything fails here, it is the first time these tests run with the real vitest/vite toolchain. Paste the error to the team chat (or to Claude) before continuing. Everything was verified with an equivalent runner, but this run is the official one.

---

## Part D — Run the app and do the demo (≈ 10 min)

### D1. Start both servers

```powershell
npm run dev
```

(or in two terminals: `npm run dev:api` and `npm run dev:web`)

✅ Expected: `API Backend Started … Server Port: 4000` + `PostgreSQL database connected` and Vite `Local: http://localhost:5173/`.

Check the API: open <http://localhost:4000/health>. ✅ `"status":"healthy"` and `"database":{"status":"connected"}`.

### D2. Manual demo checklist (take a screenshot of each ✓ for Jira)

| # | Do this | ✅ You should see | Ticket |
| :- | :--- | :--- | :--- |
| 1 | Open <http://localhost:5173>, sign in with a **wrong** password | "Email or password is incorrect." | AESCS-166 |
| 2 | Sign in as **storekeeper.mat** → **Projects** | Only **Matara Bridge Rehabilitation** | Role guard story, AESCS-42 |
| 3 | **Sites** | Only **SITE-MAT-01**; project filter lists only Matara | AESCS-163 |
| 4 | In the browser address bar open `http://localhost:4000/api/v1/projects/e0000000-0000-0000-0000-000000000001` | `403` JSON `"code":"FORBIDDEN"` (that is the Galle project) | Role guard story AC1 |
| 5 | Sign out, sign in as **warehouse.cen** → Projects | Both projects, label "Projects you have been assigned to." | AESCS-42 |
| 6 | Sign in as **admin** → Projects → **View sites** on Galle | Only SITE-GAL-01; switch filter to "All projects" → 2 sites | AESCS-163 |
| 7 | Sign in as **driver.1** | No Projects/Sites in the menu. `http://localhost:4000/api/v1/projects` → 403 | Role guard story |
| 8 | Stop the API (Ctrl+C in its terminal), open Projects | Red "Something went wrong" + **Try again**; start API → Try again works | AESCS-162 |
| 9 | Shrink the browser to phone width | Rows become cards, no sideways scrolling | AESCS-162 |
| 10 | Check denials were logged: `docker exec -i qorvenz_postgres psql -U qorvenz_user -d qorvenz_db -c "select metadata->>'reason' reason, metadata->>'path' path, created_at from system_audit_logs where event_type='ACCESS_DENIED' order by created_at desc limit 5"` | Rows with `PROJECT_OUT_OF_SCOPE` / `ROLE_NOT_PERMITTED` | Role guard story AC2 |

---

## Part E — Git, pull requests, CI, then Jira

### E1. Clean up before committing

```powershell
Remove-Item -Recurse -Force _to_delete      # temporary files from the AI session; never commit
git status
```

### E2. Commit per member (Jira keys in the messages → Jira links them automatically)

Create one branch per member from your current branch. Put the **Jira key** in the branch name and commit message. If the *GitHub for Jira* app is connected, the branch, commits and PR then appear in each ticket's **Development** panel.

> Replace `AESCS-XX` with the real key of the role-guard story (it wasn't visible in the screenshots), and adjust keys if yours differ.

```powershell
# --- shared foundation first (everyone depends on it) — Member 4 opens this PR ---
git switch -c feature/AESCS-46-sprint1-foundation
git add .gitignore .env.example package.json apps/api/package.json .github/workflows/ci.yml docs/ evidence/ frontend/src/index.css
git commit -m "AESCS-46 docs+ci: Sprint 1 docs, UI refresh, CI evidence upload"
git push -u origin feature/AESCS-46-sprint1-foundation

# --- Member 2: schema + seed ---
git switch -c feature/AESCS-40-core-schema
git add database/ scripts/
git commit -m "AESCS-40 AESCS-160 AESCS-41 AESCS-161 feat(db): core org schema, rollback, repeatable seed"
git push -u origin feature/AESCS-40-core-schema

# --- Member 1: role guard + project scope ---
git switch -c feature/AESCS-XX-role-guard
git add apps/api/src/ apps/api/tests/authorize.test.ts apps/api/tests/organization.routes.test.ts apps/api/tests/scope.integration.test.ts apps/api/tests/helpers/
git commit -m "AESCS-XX feat(api): role guard, project-scope middleware, GET /projects /sites"
git push -u origin feature/AESCS-XX-role-guard

# --- Member 3: pages ---
git switch -c feature/AESCS-42-project-site-pages
git add frontend/src/pages/ frontend/src/services/organization.ts frontend/src/App.tsx
git commit -m "AESCS-42 AESCS-162 AESCS-163 feat(web): Projects and Sites pages"
git push -u origin feature/AESCS-42-project-site-pages

# --- Member 4: smoke tests ---
git switch -c feature/AESCS-46-smoke-tests
git add apps/api/tests/smoke.test.ts
git commit -m "AESCS-46 AESCS-166 AESCS-167 test(api): health/auth smoke + cross-project tests"
git push -u origin feature/AESCS-46-smoke-tests
```

Each branch is created from the previous one, so they stack. Merge the PRs **in the order above**. If your mentor prefers, do one branch `feature/sprint-01` with all of it and one PR listing every key. Both approaches are fine.

### E3. Open the pull requests on GitHub

For each pushed branch: GitHub → **Compare & pull request** → base `main` (or `develop`).

* **Title:** `AESCS-40: Core company/project/site/department schema` (key first).
* **Description:** paste the matching rows of `evidence/sprint-01/JIRA-COVERAGE.md` §1 and mention decision **D-018** (why file paths differ from the Jira examples).
* **Reviewers:** at least one other member (handbook rule: nobody merges their own work).

✅ Expected: the **Qorvenz CI Pipeline** check runs automatically and turns green. It typechecks, lints, migrates, seeds twice, runs the SQL constraint test, runs the API tests (including the real-DB scope test) and the web tests, and builds.

### E4. Download the CI evidence

GitHub → **Actions** → the green run → bottom **Artifacts** → `api-test-results` (zip with `junit.xml`). Also take a screenshot of the green run summary.

### E5. Update each Jira ticket

Do this for every ticket, **subtasks first, then the parent story**:

1. Open the ticket and drag it to **In Progress** when work starts (if not already).
2. **Link the PR.** This is automatic if the Jira key is in the branch, commit or PR title and GitHub for Jira is connected. Otherwise: **⋯ → Link → Web link** → paste the PR URL.
3. **Attach the evidence** (Attachments → drag files) from the table below.
4. **Add a comment** using the template below.
5. When the PR is approved and merged and CI is green: move the ticket to **Done** (drag on the board, or use the status button **To Do ▾ → Done**).

**Comment template:**

```
Done ✅
PR: <link>  (merged, CI green: <link to Actions run>)
What: <one line from JIRA-COVERAGE.md>
Acceptance criteria:
 1. <criterion> — PASS (<test file / evidence file>)
 2. <criterion> — PASS (...)
 3. Tests/demo evidence attached; reviewed by <name> in the PR — PASS
Evidence: attached <files>
```

**What to attach to each ticket**

| Ticket | Attach | Acceptance criteria → proof |
| :--- | :--- | :--- |
| Role guard story (AESCS-XX) + 2 subtasks | `evidence/sprint-01/test-runs/02-api-tests.txt`, `04-real-end-to-end.txt`, screenshot of demo step 4 + step 10 | AC1 403: `authorize.test.ts`, `organization.routes.test.ts` · AC2 scope + logged denials: `scope.integration.test.ts`, demo step 10 · AC3: PR link |
| AESCS-40 + subtask | `01-database.txt`, your Part B4 output | AC1 PK/FK/unique: 25 PASS lines · AC2 indexes: "lookup indexes exist" line · rollback: Part B5 |
| AESCS-160 | `01-database.txt` | grants, cross-company rejection, cascade lines |
| AESCS-41 / AESCS-161 | `01-database.txt`, screenshot of demo step 2 | AC1 repeatable: 2nd seed "unchanged" · AC2 visible with test login: demo step 2 · no shared passwords: distinct hashes + legacy account DISABLED |
| AESCS-42 / 162 / 163 | screenshots in `evidence/sprint-01/screenshots/`, `05-web-unit-tests.txt`, `03-web-browser-checks.txt` | AC1 allowed projects/sites: demo steps 2–6 · AC2 loading/empty/error: screenshots + demo step 8 |
| AESCS-45 / 164 / 165 | links to `docs/architecture/ai-permissions-and-safe-tools.md` and `ai-evidence-and-review-data.md` | AC "documented **and reviewed**": **reviewers must first fill in the sign-off table at the end of each doc**, then commit it |
| AESCS-46 / 166 / 167 | `api-test-results` zip from CI (E4), `02-api-tests.txt`, CI screenshot | AC "all tests pass and results attached": the CI artifact |

### E6. Complete the sprint in Jira

When every Sprint 1 ticket is **Done**:

1. Jira → your project → **Board** (active sprint) → top right **Complete sprint**.
2. Jira shows "X issues done, 0 open". If anything is still open, it asks where to move it (next sprint or backlog). Choose **next sprint** and write the reason in the ticket.
3. Optional: **Reports → Sprint report** → export/screenshot for the mentor.

---

## Part F — Handbook Sprint 1 items that are **not** in Jira

The handbook's Sprint 1 cards (Days 001–010) also need a few human steps (see `docs/sprint-01/00-SPRINT-01-STATUS.md` §3):

| Item | Who | Where to record it |
| :--- | :--- | :--- |
| Day 002 stakeholder interviews (answers) | M1, M2, M3 | `docs/sprint-01/02-interview-sheets.md` answer columns → move answers into `docs/decision-log.md` (OPEN → DECIDED) |
| Peer review link on each of the 40 cards | all | `evidence/sprint-01/day-0XX/member-N/notes.md` → replace `<paste PR / review URL>` and tick the box |
| Day 009 cross-review ticks | all | `docs/sprint-01/10-stakeholder-review-packet.md` §3 |
| Day 010 mentor review | M4 leads | `docs/sprint-01/11-sprint-01-demo-and-mentor-review.md` §3 (use Part D2 as the live demo) |

Then tick the last boxes in `00-SPRINT-01-STATUS.md` §3. That is the handbook's Sprint 1 sign-off.

---

## Part G — Troubleshooting

| Problem | Fix |
| :--- | :--- |
| `SESSION_SECRET must contain at least 32 characters` | Set `SESSION_SECRET` in `.env` (Part A3). |
| `ECONNREFUSED 127.0.0.1:5434` / DB disconnected | Start Docker Desktop, then `docker compose up -d`. Check `.env` has `DB_PORT=5434` and `POSTGRES_PORT=5434`. |
| Port 5434 already used | Change both `POSTGRES_PORT` and `DB_PORT` in `.env` to e.g. `5435`, then `docker compose up -d`. |
| `Cannot find module 'express'` (or pg, vitest, …) | Run `npm install` in the repo root (not inside a sub-folder). |
| Lost the seeded passwords | Set `SEED_PASSWORD_*` in `.env`, then reset the DB: `docker compose down -v; docker compose up -d; npm run db:migrate; npm run db:seed`. **Warning:** `-v` deletes your local DB data. |
| `admin@qorvenz.local` can't log in | Expected. It used a password published in the repo, so the seed disables it. Use `admin@demo.qorvenz.test`. |
| Login works but Projects shows "You don't have access" | You are signed in as a driver (no project access, by design). |
| `warning: LF will be replaced by CRLF` on `git add` | Harmless on Windows. |
| CI fails only at "Verify Schema Constraints" | The CI runner needs `psql`; it is pre-installed on `ubuntu-latest`. Re-run the job. If it still fails, read the first `FAIL:` line. |
| A test fails in Part C | Re-run that one file, e.g. `npx vitest run tests/smoke.test.ts` inside `apps/api`, and share the output. |

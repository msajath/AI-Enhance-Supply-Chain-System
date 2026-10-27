# Qorvenz Tech — Team Collaboration & Git Workflow

## 1. Team Responsibilities & Ownership Matrix

| Member | Focus Modules | Git Branch Namespace | Primary Directory Areas |
| :--- | :--- | :--- | :--- |
| **Member 1** | Authentication, Organization Master, Procurement, Supplier Management | `feature/member1-*` | `apps/api/src/modules/auth/`, `procurement/`, `apps/web/src/pages/auth/`, `procurement/` |
| **Member 2** | Material Master, Warehouses, Inventory, Stock Movements | `feature/member2-*` | `apps/api/src/modules/inventory/`, `apps/web/src/pages/inventory/` |
| **Member 3** | Fleet & Heavy Equipment, Transportation, Delivery Tracking | `feature/member3-*` | `apps/api/src/modules/fleet/`, `logistics/`, `apps/web/src/pages/fleet/` |
| **Member 4** | Reporting & Analytics, AI Orchestration, DevOps, Testing & CI/CD | `feature/member4-*` | `apps/api/src/modules/reporting/`, `ai/`, `.github/workflows/`, root DevOps configs |

---

## 2. Branching Strategy

Our team utilizes standard GitFlow-adapted branching:

- `main`: Production-ready release branch. Locked against direct commits.
- `develop`: Integration staging branch for completed sprint features.
- `feature/<member>-<jira-ticket>-<description>`: Dedicated branch for each developer task.

### Examples:
- `feature/member1-QOR-101-auth-jwt`
- `feature/member2-QOR-102-warehouse-crud`
- `feature/member3-QOR-103-fleet-tracking`
- `feature/member4-QOR-104-ci-pipeline`

---

## 3. Step-by-Step Developer Workflow

### Step 1: Sync with Latest Upstream
Before starting any work:
```bash
git checkout develop
git pull origin develop
```

### Step 2: Create a Feature Branch
```bash
git checkout -b feature/member1-auth-service
```

### Step 3: Implement, Lint & Test Locally
Before committing, ensure your code compiles and passes all checks:
```bash
npm run typecheck
npm run lint
npm run test
```

### Step 4: Commit with Conventional Commits
Format commit messages with standard prefixes:
- `feat:` new feature for the user
- `fix:` bug fix
- `refactor:` code refactor without feature changes
- `test:` adding or refactoring tests
- `docs:` documentation updates
- `chore:` build tasks, package updates

```bash
git add .
git commit -m "feat(auth): implement JWT token generation and validation middleware"
```

### Step 5: Push Feature Branch
```bash
git push -u origin feature/member1-auth-service
```

### Step 6: Create GitHub Pull Request (PR)
- Open a PR against `develop`.
- Link the Jira issue in the PR description.
- Ensure all automated GitHub Actions CI checks pass (green).
- Request code review from at least one other team member.
- Merge using **Squash and Merge** or **Rebase and Merge** once approved.

---

## 4. Conflict Resolution Protocol

If your branch conflicts with `develop`:
```bash
# 1. Fetch latest changes
git fetch origin

# 2. Rebase feature branch onto develop
git checkout feature/member1-auth-service
git rebase origin/develop

# 3. Resolve conflicted files in VS Code
# Look for <<<<<<< HEAD ... >>>>>>> markers

# 4. Stage resolved files
git add <resolved-file>

# 5. Continue rebase
git rebase --continue

# 6. Force-push feature branch safely
git push --force-with-lease
```

---

## 5. Definition of Done (DoD) for Sprint 1 Tasks

A task is considered **Done** only when:
1. Feature meets the user story acceptance criteria.
2. Code is formatted according to ESLint and Prettier rules.
3. TypeScript compiles without any errors (`npm run typecheck`).
4. Unit/integration tests are written and passing (`npm run test`).
5. No sensitive credentials or secrets are committed.
6. PR has been reviewed and approved by a peer.

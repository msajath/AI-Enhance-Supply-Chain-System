# Qorvenz — Decision Log (Sprint 1: Requirements and Validation)

> Single source of truth for Sprint 1 decisions, assumptions and open questions.
> Every Sprint 1 task card (QOR-01-DD-Mn) edits this file, as the handbook specifies.
> **Rule:** we record what the client/mentor *said*. Anything we have not confirmed stays **OPEN**. We do not invent client policy.

| Field | Value |
| :--- | :--- |
| Source documents | Qorvenz Tech SRS (12 pp., "Construction Supply Chain Management & AI Automation") · Qorvenz Engineering Execution Handbook (Sprint 01, Days 001–010) |
| Sprint | 01 — Requirements and validation (Days 001–010) |
| Sprint goal | Validated scope, assumptions, success cases and design sign-off |
| Owners | M1 Enterprise & Procurement · M2 Materials & Inventory · M3 Fleet & Delivery · M4 Reports, AI & Platform |
| Status legend | **DECIDED** = agreed by the team and confirmed by mentor/client · **PROPOSED** = team proposal, awaiting confirmation · **OPEN** = needs a stakeholder answer |

---

## 1. Decisions

| ID | Date / card | Decision | Status | Evidence / source |
| :--- | :--- | :--- | :--- | :--- |
| D-001 | Day 001 / QOR-01-01-M4 | The project covers supply chain operations only. Construction scheduling, CAD/BIM, payroll/HR, general ledger and autonomous purchasing are out of scope. | DECIDED (stated by the client in SRS §2.2) | SRS p.3, p.4 |
| D-002 | Day 001 / QOR-01-01-M4 | Transactions, approvals and stock changes use deterministic backend rules only. AI is used for prediction, analysis and recommendations and never writes directly. | DECIDED (SRS principle) | SRS p.1, §4.1, §9 |
| D-003 | Day 001 / QOR-01-01-M4 | PostgreSQL is the source of truth for all transactional data. | DECIDED (SRS §9) | SRS p.10 |
| D-004 | Day 001 / QOR-01-01-M4 | Stack: React + TypeScript + Vite (web), Node + Express + TypeScript (API), PostgreSQL 16, Docker Compose locally, GitHub Actions CI. | PROPOSED, already in use in the repo | `package.json`, `docker-compose.yml`, `.github/workflows/ci.yml` |
| D-005 | Day 002 / QOR-01-02-M4 | We build an MVP of complete, tested workflows rather than many unfinished modules. | DECIDED (SRS §12 note) | SRS p.11 |
| D-006 | Day 003 / QOR-01-03-M4 | The demo storyline is the SRS "Suggested project demonstration": steel request → stock check → PR → approval → quotations → PO → goods receipt → delivery → site receipt → dashboard → one AI answer. | PROPOSED | SRS p.11; `docs/sprint-01/03-process-swimlanes.md` |
| D-007 | Day 004 / QOR-01-04-M4 | Access is enforced on the server by role **and** scope (company, project, warehouse). The browser never supplies a trusted company/project ID. | PROPOSED | SRS §5; `docs/sprint-01/05-permission-matrix-and-api-draft.md` |
| D-008 | Day 005 / QOR-01-05-M4 | Proposed initial NFR targets are listed in `06-acceptance-and-test-cases.md` §4. They are not commitments until the mentor approves them. | PROPOSED | — |
| D-009 | Day 006 / QOR-01-06-M4 | Schema changes after Sprint 1 go through **new numbered migrations** only. `001_sprint1_foundation.sql` is not edited once it has been shared. | PROPOSED | Handbook Day 011 rule |
| D-010 | Day 006 / QOR-01-06-M4 | Naming convention: singular snake_case tables, `<table>_id` foreign keys, and `company_id` on every tenant-owned table. The repo currently uses `organizations` / `organization_id`. We need to choose one before Sprint 2 (see Q-401). | PROPOSED | `07-erd-review.md` |
| D-011 | Day 007 / QOR-01-07-M4 | Jira epics: E01-FND Foundation · E02-PROC Procurement · E03-INV Inventory · E04-LOG Fleet & Delivery · E05-RPT Reporting & Alerts · E06-AI AI capability · E07-SEC Security & Quality · E08-RELEASE Hardening & Handover. | PROPOSED | `08-user-stories-backlog.md` |
| D-012 | Day 008 / QOR-01-08-M4 | Demo data is synthetic only: 1 company, 2 projects, 2 sites, 2 warehouses, 3 suppliers, 6 materials, 3 vehicles, 3 drivers. No real customer data is committed. | PROPOSED (needs answer to Q-406) | `09-demo-fixtures-and-data-governance.md` |
| D-013 | Day 009 / QOR-01-09-M4 | Proposed Sprint 2 capacity is 4 members × 10 days with 20% kept for review, fixes and the mentor demo. | PROPOSED | `10-stakeholder-review-packet.md` |
| D-014 | Jira Sprint 1 / role guard story | Requests for a project outside the caller's scope return **403 FORBIDDEN**, with the same body for unknown IDs, so IDs cannot be probed. Settles the "404 or 403" note in `05` §1 rule 1 in favour of the Jira acceptance criterion. | PROPOSED (matches Jira AC) | `apps/api/src/middleware/authorize.ts` |
| D-015 | Jira Sprint 1 / role guard story | Project & site **read** access: ADMIN = whole company; WAREHOUSE_MANAGER = only projects granted in `user_project_access`; DRIVER = none (403). | PROPOSED (matrix row "Company / project / site / warehouse setup") | `apps/api/src/auth/permissions.ts` |
| D-016 | Jira AESCS-40 | `organizations` stays the company table for now (Q-401 still open). Tenant safety is enforced in the database with composite `(id, organization_id)` foreign keys. | PROPOSED | `database/migrations/002_core_org_structure.sql` |
| D-017 | Jira AESCS-161 | Seed users get **individual** random passwords (or `SEED_PASSWORD_*` env values), printed once. The old shared `Password123!` account is rotated on the next seed. | DECIDED (Jira AC "no shared demo passwords") | `scripts/seed.ts` |
| D-018 | Jira Sprint 1 | Files follow the repo's existing layout rather than the example paths in Jira. Migrations go in `database/migrations/002_…` (001 was already shared, see D-009), the seed in `scripts/seed.ts`, and pages in `frontend/src/pages/`. | DECIDED | `evidence/sprint-01/JIRA-COVERAGE.md` §3 |
| D-019 | Jira AESCS-41 | The seed implements the D-012 fixture plan: PRJ-GAL, PRJ-MAT, SITE-GAL-01, SITE-MAT-01, WH-CEN, WH-MAT and users with `@demo.qorvenz.test` e-mails. The company `QOR-HQ-01` and central warehouse `WH-CENTRAL-01` (= WH-CEN) are reused from the shared 001 seed. Only users whose role exists in code are created (others wait for Q-402). The old `admin@qorvenz.local` shared-password account is disabled. | PROPOSED | `docs/sprint-01/09` §1 notes |

---

## 2. Assumptions (all OPEN until confirmed)

| ID | Owner | Assumption | Why it matters | Status |
| :--- | :--- | :--- | :--- | :--- |
| A-101 | M1 | A requisition is raised for **one** project and may contain several material lines. | Shapes the requisition and requisition_item tables. | OPEN |
| A-102 | M1 | Approval levels depend on transaction type and total value (SRS §3.1), but the actual thresholds are unknown. | We need the approval-matrix configuration. | OPEN |
| A-103 | M1 | Each PO is placed with exactly one supplier, and may cover part of a requisition. | Needed for partial PO coverage logic. | OPEN |
| A-104 | M1 | A requester can never approve their own requisition or PO (separation of duties, SRS §5). | Self-approval must be denied. | OPEN, likely |
| A-201 | M2 | Warehouses are central, regional or site. Zones, racks and bins are optional (SRS §3.5). | Determines location depth. | OPEN |
| A-202 | M2 | Units are kg, bag, m³, piece, ton and litre, and conversions are defined per material. | We need the conversion table. | OPEN |
| A-203 | M2 | Negative stock is never allowed, and stock cannot be reserved beyond what is on hand. | Basic stock invariant. | OPEN, likely (SRS §3.5) |
| A-204 | M2 | Rejected goods-receipt quantities go to quarantine, not to available stock. | Affects how receipt is recorded. | OPEN |
| A-301 | M3 | Vehicle capacity is checked by weight (kg). Volume checks are optional. | Needs material unit weights. | OPEN |
| A-302 | M3 | A vehicle or driver cannot have two deliveries with overlapping time windows. | Assignment-conflict rule. | OPEN, likely (SRS §11) |
| A-303 | M3 | A vehicle in MAINTENANCE status cannot be assigned. | SRS §3.8 "prevent restricted vehicles". | OPEN, likely |
| A-304 | M3 | A site receipt can accept part of a delivery and record damaged and short quantities. | Partial acceptance (SRS §3.9). | OPEN, likely |
| A-401 | M4 | Exactly one AI capability will be formally evaluated for the MVP: demand forecasting / shortage risk. | SRS §12 asks for "at least one". | OPEN |
| A-402 | M4 | No paid third-party integrations (GPS, ERP, maps) in the MVP. | SRS §2.2, §6. | OPEN |
| A-403 | M4 | Currency is LKR, the time zone is Asia/Colombo and the language is English. | Localization (SRS §7). | OPEN |

---

## 3. Open questions for client / mentor

These come straight from SRS §13 plus gaps we found. Answers get copied into §1 as DECIDED.

| ID | Owner | Question | Asked to | Answer | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Q-101 | M1 | What are the approval levels and value thresholds for PR and PO? Who approves at each level? | Client | — | OPEN |
| Q-102 | M1 | How many quotations are required before a PO (for example, 3 for orders above a threshold)? | Client | — | OPEN |
| Q-103 | M1 | Can a PO be amended after approval? Does an amendment need re-approval? | Client | — | OPEN |
| Q-104 | M1 | Is a supplier portal in MVP scope? | Client | — | OPEN |
| Q-201 | M2 | Which warehouse levels exist (central/regional/site)? Are bins required? | Client | — | OPEN |
| Q-202 | M2 | Which materials need batch, lot, serial or expiry tracking (for example cement expiry)? | Client | — | OPEN |
| Q-203 | M2 | Who approves stock adjustments after a physical count, and is there a tolerance? | Client | — | OPEN |
| Q-204 | M2 | What happens to rejected receipt quantities: return to supplier, quarantine or write-off? | Client | — | OPEN |
| Q-301 | M3 | Are drivers system users who capture proof of delivery on a phone, or does a coordinator enter it? | Client | — | OPEN |
| Q-302 | M3 | What counts as proof of delivery: signature, photo, recipient name, or a combination? | Client | — | OPEN |
| Q-303 | M3 | Is third-party transport in MVP scope? | Client | — | OPEN |
| Q-304 | M3 | Is maintenance scheduled by time, mileage or engine hours for MVP? | Client | — | OPEN |
| Q-401 | M4 | Keep the current `organizations` table or rename it to `company` to match the handbook reference schema? | Mentor | — | OPEN |
| Q-402 | M4 | The repo currently has 3 roles (Admin, Warehouse manager, Driver) but the SRS lists 12. Which roles are mandatory for MVP? | Client / Mentor | — | OPEN |
| Q-403 | M4 | Which AI provider or local model is allowed, and what is the API budget? | Client | — | OPEN |
| Q-404 | M4 | What are the deadline, demo date and academic assessment rubric? | Mentor | — | OPEN |
| Q-405 | M4 | Where will we deploy, and what are the source-code and handover expectations? | Client | — | OPEN |
| Q-406 | M4 | Will realistic sample data be provided, or do we create synthetic data? How many projects, sites, users, suppliers, vehicles and materials? | Client | — | OPEN |
| Q-407 | M4 | Which acceptance tests and minimum quality thresholds decide completion? | Client / Mentor | — | OPEN |

---

## 4. Sprint 1 artefact index

| # | Artefact | Owner(s) | Day(s) |
| :- | :--- | :--- | :--- |
| 0 | [Sprint 1 status & completion checklist](sprint-01/00-SPRINT-01-STATUS.md) | M4 | 010 |
| 1 | [Scope register & SRS traceability](sprint-01/01-scope-register.md) | M4 | 001 |
| 2 | [Discovery & interview sheets](sprint-01/02-interview-sheets.md) | M1, M2, M3 | 001–002 |
| 3 | [Process swimlanes, context diagram & architecture](sprint-01/03-process-swimlanes.md) | All | 003 |
| 4 | [Data dictionary](sprint-01/04-data-dictionary.md) | M1, M2, M3 | 004 |
| 5 | [Permission matrix & cross-module API draft](sprint-01/05-permission-matrix-and-api-draft.md) | M4 | 004 |
| 6 | [Acceptance examples, test cases & NFR targets](sprint-01/06-acceptance-and-test-cases.md) | All | 005 |
| 7 | [ERD review & migration boundaries](sprint-01/07-erd-review.md) | All | 006 |
| 8 | [User stories, priorities & Jira epics](sprint-01/08-user-stories-backlog.md) | All | 007 |
| 9 | [Demo fixtures & data-governance checklist](sprint-01/09-demo-fixtures-and-data-governance.md) | All | 008 |
| 10 | [Stakeholder review packet & Sprint 2 capacity](sprint-01/10-stakeholder-review-packet.md) | All | 009 |
| 11 | [Sprint 1 demo script & mentor feedback record](sprint-01/11-sprint-01-demo-and-mentor-review.md) | All | 010 |
| — | Daily evidence notes: `evidence/sprint-01/day-001 … day-010/member-1 … member-4/notes.md` (40 notes) | All | 001–010 |

---

## 5. Change history

| Date | Change | By |
| :--- | :--- | :--- |
| 2026-11-05 | Created the Sprint 1 decision log, all 11 artefacts and 40 evidence notes. Every client-dependent item is marked OPEN. | Team (drafted with AI assistance; needs peer review) |
| 2026-11-05 | Frontend UI refresh (60-30-10 colour system + motion). This is a visual change only, no Sprint 2 scope. See `sprint-01/00-SPRINT-01-STATUS.md` §4. | Team (drafted with AI assistance; needs peer review) |
| 2026-11-05 | Jira Sprint 1 tickets implemented (AESCS-40…46 + subtasks): schema 002 + rollback, repeatable seed, role guard / project-scope middleware, GET /projects & /sites, Projects & Sites pages, AI governance docs, smoke + cross-project tests, CI evidence. D-014…D-018 added. See `../evidence/sprint-01/JIRA-COVERAGE.md`. | Team (drafted with AI assistance; needs peer review) |
| 2026-11-05 | Double-check pass: seed aligned with the Sprint 1 fixture plan (D-019). Re-verified from the files on the team's computer: 66 API tests, 30 web unit tests, 19 real end-to-end checks, typecheck and lint clean. | Team (drafted with AI assistance; needs peer review) |

# 10 — Stakeholder Review Packet & Sprint 2 Capacity

**Cards (Day 009):** QOR-01-09-M1 (review process maps, revise acceptance criteria) · M2 (review inventory tests & schema) · M3 (review delivery tests & integration sequence) · M4 (compile packet, propose Sprint 2 capacity)
**Status:** Ready to send to the mentor/client.

## 1. What we are asking the reviewer to approve

1. **Scope and MVP priorities:** `01-scope-register.md` §2 (Must/Should/Could column).
2. **Process flows:** `03-process-swimlanes.md` (PR→PO, receipt→stock→transfer, transport→site acceptance).
3. **Permission model:** `05-permission-matrix-and-api-draft.md` §1 and the role mapping in §2.
4. **Acceptance tests and NFR targets:** `06-acceptance-and-test-cases.md`.
5. **Schema direction:** `07-erd-review.md` §5 (naming, tenancy, migration rules).
6. **Answers to the 19 open questions** in `decision-log.md` §3. The top 6 blockers for Sprint 2–4 are below.

## 2. Top blocking questions (answer first)

| Priority | ID | Question | Blocks |
| :- | :--- | :--- | :--- |
| 1 | Q-402 | Which roles are mandatory for MVP? | Sprint 2 access work |
| 2 | Q-401 | Keep `organizations` or rename to `company`? | Migration 002 |
| 3 | Q-101 | Approval levels and thresholds | Sprint 4 PR/PO approval |
| 4 | Q-406 | Sample data, or synthetic? What volumes? | Fixtures, forecasting |
| 5 | Q-404 | Deadline, demo date, rubric | Sprint planning |
| 6 | Q-403 | AI provider and budget | Sprints 9–10 |

## 3. Cross-review checklist (Day 009)

The drafts already include the points below. Each reviewer still has to confirm them in person and fill in the Result column.

| Reviewer → artefact | Points already built into the draft | Result (fill in) |
| :--- | :--- | :--- |
| M2 + M3 → M1 process map & acceptance | TC-PO-02 (PO above outstanding), PR immutability (TC-PR-07) | ☐ Accepted ☐ Changes |
| M1 + M3 → M2 inventory tests & schema | Concurrency test TC-INV-02, idempotent receipt TC-GR-03, separate reservation table | ☐ Accepted ☐ Changes |
| M1 + M2 → M3 delivery tests & sequence | Half-open interval rule TC-VA-05, DB exclusion constraint, `short_qty` | ☐ Accepted ☐ Changes |
| M1–M3 → M4 permission matrix | Driver limited to own trips, auditor read-only | ☐ Accepted ☐ Changes |

**Integration sequence (M3):** inventory `POST /stock/issues` must exist before `POST /deliveries/:id/dispatch`, and goods receipt before transfers. That order is reflected in the Sprint 3–7 plan.

## 4. Proposed Sprint 2 capacity — "Foundation and access"

Sprint gate (handbook): *all four laptops can start the app; cross-project access denied.*

| Assumption | Value |
| :--- | :--- |
| Members × days | 4 × 10 = 40 member-days |
| Reserved for review, fixes, Day-5 sync and Day-10 demo | 20% → 8 days |
| Available for planned work | 32 member-days |

| Member | Sprint 2 focus (handbook) | Planned days | Notes from Sprint 1 |
| :--- | :--- | :- | :--- |
| M1 | Auth module review, projects/sites, `user_project_access`, scope middleware | 8 | Auth already exists in repo: a head start |
| M2 | Migration 002 review: material/warehouse constraints, company-scoped codes | 8 | Fix globally-unique warehouse code (ERD §1) |
| M3 | Vehicle/driver tables, capacity CHECK, MAINTENANCE restriction, overlap tests | 8 | Switch `capacity_tons` → `capacity_kg` |
| M4 | Docker/CI reproducible on a fresh machine, test DB, cross-project denial test | 8 | CI exists; add PostgreSQL integration job evidence |

**Risk:** the repo already contains Sprint 2-style code (auth, CI, migration). Sprint 2 should *verify and harden* it rather than rebuild it, and add the missing scope tables.

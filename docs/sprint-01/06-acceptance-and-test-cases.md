# 06 — Acceptance Examples, Test Cases & NFR Targets

**Cards (Day 005 midpoint):** QOR-01-05-M1 (requisition & quotation acceptance) · QOR-01-05-M2 (stock ledger, negative stock, counts) · QOR-01-05-M3 (capacity, overlap, partial delivery) · QOR-01-05-M4 (NFR targets & baseline test plan)
**Status:** Drafted. Expected results that depend on an OPEN item are marked ⚠.

Format: Given / When / Then. The test IDs are reused in the Sprint 3+ automated tests (`apps/api/tests/*.test.ts`).

## 1. Procurement (Member 1)

| ID | Given | When | Then |
| :--- | :--- | :--- | :--- |
| TC-PR-01 | Site engineer with access to Project A | Creates a PR for Project A with 1 line: 10 t steel 12 mm | 201, status DRAFT, audit event written |
| TC-PR-02 | Same user | Creates a PR for Project B (no access) | 404/403, nothing written |
| TC-PR-03 | PR line quantity 0 or negative | Submit | 400 VALIDATION_ERROR |
| TC-PR-04 | PR SUBMITTED by user U | U tries to approve it | 403, separation of duties ⚠ A-104 |
| TC-PR-05 | PR SUBMITTED | Approver rejects without a reason | 400, reason required |
| TC-PR-06 | PR value above the approver's limit | Approver approves | 403 or escalation ⚠ Q-101 |
| TC-PR-07 | PR APPROVED | Requester edits lines | 409, approved PR is immutable |
| TC-QT-01 | Approved PR, supplier S1 APPROVED | Record a quotation from S1 | 201 |
| TC-QT-02 | Supplier S2 SUSPENDED | Record a quotation from S2 | 422 supplier not approved |
| TC-QT-03 | 3 quotations recorded | Open the comparison | Sorted by total price, with lead time and validity shown. Expired quotations are flagged |
| TC-PO-01 | Approved PR 10 t | Create a PO for 6 t → approve | PO OPEN, PR PARTIALLY_ORDERED, outstanding 4 t |
| TC-PO-02 | Outstanding 4 t | Create a PO for 5 t | 422 quantity exceeds outstanding |
| TC-PO-03 | PO created by user P | P approves it | 403 |

## 2. Inventory (Member 2)

| ID | Given | When | Then |
| :--- | :--- | :--- | :--- |
| TC-GR-01 | PO line 100 bags cement | Receive 60 accepted + 5 rejected | Balance +60, ledger 1 row (+60, RECEIPT, PO ref, actor). Outstanding 35. PO PARTIAL |
| TC-GR-02 | Outstanding 35 | Receive 40 | 422 over-receipt |
| TC-GR-03 | Same request_key sent twice | Receive | Second call returns the first result. No duplicate ledger row |
| TC-INV-01 | on_hand 50, reserved 20 | Issue 40 | 422, available is only 30 |
| TC-INV-02 | on_hand 50 | Two concurrent issues of 30 each | Exactly one succeeds. on_hand never goes below 0 (row lock or serializable) |
| TC-INV-03 | Any balance change | — | Sum of ledger deltas = on_hand (reconciliation query) |
| TC-TR-01 | WH-A 50, WH-B 0 | Transfer 20 A→B | A 30, B 20, two ledger rows with the same transfer reference |
| TC-TR-02 | — | Transfer A→A | 400 from ≠ to |
| TC-TR-03 | Warehouse user scoped to A only | Transfer from B | 403/404 |
| TC-CNT-01 | System 50, counted 47 | Submit count | Pending adjustment −3. Balance unchanged until approved ⚠ Q-203 |
| TC-CNT-02 | Counter = approver | Approve own count | 403 |
| TC-RL-01 | Reorder level 100, on_hand 105 | Issue 10 | Low-stock alert created once (dedupe key) |

## 3. Fleet & delivery (Member 3)

| ID | Given | When | Then |
| :--- | :--- | :--- | :--- |
| TC-VA-01 | Lorry capacity 8,000 kg. Load is 6 t steel + 1 t cement | Assign | 201 (7,000 kg ≤ 8,000) |
| TC-VA-02 | Same lorry | Load 9,000 kg | 422 capacity exceeded |
| TC-VA-03 | Vehicle status MAINTENANCE | Assign | 422 vehicle unavailable ⚠ A-303 |
| TC-VA-04 | Vehicle booked 09:00–12:00 | New booking 11:00–14:00 | 409 overlap |
| TC-VA-05 | Booking 09:00–12:00 | New booking 12:00–14:00 | 201 (touching windows allowed: half-open intervals) |
| TC-VA-06 | Driver booked 09:00–12:00 on another vehicle | Same driver 10:00–11:00 | 409 driver overlap |
| TC-VA-07 | Driver licence expired | Assign | 422 |
| TC-DL-01 | Dispatched 100 bags | Site accepts 100 | DELIVERED, POD recorded |
| TC-DL-02 | Dispatched 100 | Accept 90, damaged 6, short 4 | PARTIAL. Discrepancy record created. Totals = 100 |
| TC-DL-03 | Dispatched 100 | Accept 101 | 422 |
| TC-DL-04 | Driver D2 | Records POD for D1's delivery | 403 |

## 4. Proposed non-functional targets (Member 4)

These are **starting proposals** for the mentor to confirm (decision log D-008). They are measured in Sprint 11.

| Area | Proposed target | How we'll measure |
| :--- | :--- | :--- |
| Performance | p95 < 500 ms for list/detail API calls and < 800 ms for stock/receipt writes at 20 concurrent users on staging. Dashboard first paint < 2.5 s on a laptop over 4G | k6 / autocannon load script, Lighthouse |
| Scalability (sizing assumption) | 5 projects, 10 warehouses, 100 users, 2,000 materials, 200k ledger rows | Seeded data volume test |
| Security | bcrypt cost ≥ 10, HttpOnly + SameSite session cookies, HTTPS in staging, Zod validation on every input, no secrets in git, OWASP Top-10 checklist | Tests + `npm audit` + manual checklist |
| Authorization | 100% of module endpoints have a negative (cross-scope) test | Test inventory |
| Reliability | Daily DB backup with a documented restore. RPO ≤ 24 h, RTO ≤ 4 h (staging) | Restore drill |
| Usability | Responsive from 360 px to 1440 px. WCAG 2.1 AA contrast. Keyboard navigable. Clear error messages | axe check, manual review |
| Data integrity | DB constraints and transactions for stock, PO and delivery. Ledger reconciliation = 0 differences | TC-INV-03 |
| AI resilience | Timeout 10 s, 1 retry, a per-user rate limit and a safe "unavailable" response. Core flows unaffected | Fault-injection test |
| Maintainability | Lint and typecheck clean. PR review required. ≥ 70% line coverage on domain services | CI |
| Localization | LKR currency, Asia/Colombo time zone, metric units ⚠ A-403 | Config review |

## 5. Baseline test plan

| Level | Tool | Scope | When |
| :--- | :--- | :--- | :--- |
| Unit | Vitest | Domain rules (quantity reconciliation, overlap, capacity) | Every PR |
| API integration | Vitest + Supertest + real PostgreSQL (CI service) | Endpoints, auth, scope, transactions | Every PR |
| Frontend | Vitest + Testing Library | Forms, validation, role navigation | Every PR |
| E2E (planned) | Playwright | The SRS demo storyline | Sprint 7+ |
| Load | k6 / autocannon | §4 targets | Sprint 11 |
| AI evaluation | Python baseline (`ml/`) chronological 80/20, MAE/WAPE | Forecast capability | Sprint 9 |

**Current baseline (2026-11-05):** existing tests are `apps/api/tests/health.test.ts`, `auth.test.ts`, `auth.integration.test.ts` and `frontend/src/App.test.tsx` (login and session lifecycle). No domain tests exist yet, which is expected because the domain modules start in Sprint 3.

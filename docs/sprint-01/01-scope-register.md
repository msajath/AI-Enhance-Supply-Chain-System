# 01 — Scope Register & SRS Traceability

**Card:** QOR-01-01-M4 (Day 001) · **Owner:** Member 4 · **Status:** Drafted, awaiting peer review

This register traces each SRS requirement to an MVP decision, the owning member, and the sprint where the handbook plans it. **MVP?** shows the team's *proposed* priority. It stays a proposal until the mentor/client confirms it (see Q-404, Q-407 in the decision log).

## 1. Scope boundary (from SRS §2)

| In scope (SRS §2.1) | Out of scope unless agreed (SRS §2.2) |
| :--- | :--- |
| Enterprise setup, projects, sites, departments, warehouses, user access | Full project scheduling / critical path |
| Requisitions, quotations, purchase orders, approvals | CAD authoring / BIM model creation |
| Material master, stock receiving/issue/transfer/reconciliation | Payroll, HR, general ledger accounting |
| Fleet & equipment, availability, maintenance, fuel, operating costs | Autonomous purchasing, payments, safety-critical vehicle control |
| Transport requests, allocation, tracking, POD, site receipt | Paid third-party integrations not approved/budgeted |
| Returns, damaged stock, wastage, discrepancies | |
| Dashboards, reports, alerts, audit trail, AI-assisted analysis | |

## 2. Requirement traceability

Priority: **M** = Must (MVP demo), **S** = Should, **C** = Could, **W** = Won't this release.

| Req | SRS ref | Requirement (summary) | Owner | MVP? | Planned sprint |
| :--- | :--- | :--- | :--- | :- | :--- |
| R-ENT-01 | 3.1 | Company, project, site, department, warehouse, cost-centre records | M1 | M (company/project/site/warehouse), S (dept/cost centre) | 02–03 |
| R-ENT-02 | 3.1 | Scope access by role/project/location | M4/M1 | M | 02 |
| R-ENT-03 | 3.1 | Approval levels configurable by type & value | M1 | M (simple threshold) | 04 |
| R-PRC-01 | 3.2 | Create and track purchase requisitions | M1 | M | 03–04 |
| R-PRC-02 | 3.2 | RFQs and quotations from approved suppliers | M1 | M | 04 |
| R-PRC-03 | 3.2 | Quotation comparison (price, spec, lead time, terms, performance) | M1 | M (price + lead time), S (rest) | 04 |
| R-PRC-04 | 3.2 | PO via approval workflow | M1 | M | 04 |
| R-PRC-05 | 3.2 | Track ordered/received/outstanding/cancelled/partial | M1/M2 | M | 04–05 |
| R-PRC-06 | 3.2 | Amendments, approval history, documents, audit | M1/M4 | S (history M) | 05–07 |
| R-SUP-01 | 3.3 | Supplier profiles, contacts, categories, certifications, status | M1 | M (profile+status) | 03 |
| R-SUP-02 | 3.3 | Supplier scorecards & comparison | M1/M4 | S | 08 |
| R-SUP-03 | 3.3 | Approve/suspend/reactivate suppliers | M1 | M | 03 |
| R-MAT-01 | 3.4 | Material codes, categories, specs, units | M2 | M | 03 |
| R-MAT-02 | 3.4 | Unit conversion; batch/lot/serial/expiry | M2 | S (conversion), C (lot/expiry) | 05+ |
| R-MAT-03 | 3.4 | Inspection outcomes, accepted/rejected, substitutions, wastage | M2 | M (accept/reject) | 04 |
| R-INV-01 | 3.5 | Multi-warehouse with optional zones/bins | M2 | M (warehouse), C (bins) | 03 |
| R-INV-02 | 3.5 | Goods receipt against PO with quality checks | M2 | M | 04 |
| R-INV-03 | 3.5 | Issues, reservations, returns, adjustments, transfers | M2 | M | 05–06 |
| R-INV-04 | 3.5 | Stock balances + traceable movement ledger | M2 | M | 04–05 |
| R-INV-05 | 3.5 | Min/max/reorder levels; low/excess/slow/damaged flags | M2 | M (reorder/low), S (rest) | 05 |
| R-INV-06 | 3.5 | Physical counts & approval-controlled adjustments | M2 | S | 06 |
| R-INV-07 | 3.5 | Prevent invalid movements & negative stock | M2 | M | 05 |
| R-DEM-01 | 3.6 | Compare stock vs demand vs open POs; shortage dates | M2/M4 | S | 08–09 |
| R-DEM-02 | 3.6 | Draft requisitions from rules | M2 | C | 09 |
| R-FLT-01 | 3.7 | Vehicle details, type, capacity, status, history | M3 | M | 03 |
| R-FLT-02 | 3.7 | Drivers/operators availability & documents | M3 | M (availability) | 03–05 |
| R-FLT-03 | 3.7 | Allocate vehicles; validate capacity & conflicts | M3 | M | 05 |
| R-FLT-04 | 3.7 | Fuel, odometer, utilisation, downtime, costs | M3 | S | 08 |
| R-FLT-05 | 3.7 | GPS/telematics | M3 | W (Q-402/A-402) | — |
| R-EQP-01 | 3.8 | Equipment register & allocation | M3 | S | 05 |
| R-EQP-02 | 3.8 | Preventive maintenance; block overdue | M3 | M (block MAINTENANCE), S (schedule) | 05–08 |
| R-DLV-01 | 3.9 | Transport requests linked to PO/transfer/site need | M3 | M | 05–06 |
| R-DLV-02 | 3.9 | Schedule pickup/delivery, status history, exceptions | M3 | M | 06 |
| R-DLV-03 | 3.9 | Dispatch qty, site receipt, POD, shortage/damage | M3 | M | 07 |
| R-DLV-04 | 3.9 | Partial deliveries, failed attempts, rescheduling | M3 | M (partial), S (rest) | 07 |
| R-RET-01 | 3.10 | Returns, damaged/written-off, reuse, wastage reports | M2/M3 | S | 07–08 |
| R-CST-01 | 3.11 | Purchase/transport/fuel/maintenance costs to project | M4 | S | 08 |
| R-RPT-01 | 3.12 | Role-specific dashboards | M4 | M | 06–08 |
| R-RPT-02 | 3.12 | Alerts: low stock, approvals, overdue PO, delays, maintenance | M4 | M (low stock + approvals) | 08 |
| R-RPT-03 | 3.12 | Filter/export by project/site/warehouse/supplier/date | M4 | M (filter), S (export) | 08 |
| R-AI-01 | 4 | ≥1 evaluated AI capability, grounded & role-scoped | M4 | M | 09–10 |
| R-AI-02 | 4.1 | AI governance: tools only, schema validation, logging, limits, fallback | M4 | M | 10 |
| R-NFR-* | 7 | Scalability, performance, security, reliability, usability, etc. | All | see `06` §4 | 11 |
| R-DEL-* | 12 | Requirements/design, software, AI, tests, docs, demo, handover | All | M | 01–12 |

## 3. Acceptance criteria mapping (SRS §11)

| # | SRS acceptance criterion | Covered by stories (see `08`) |
| :- | :--- | :--- |
| AC-1 | Requisition → PO with configured approvals | US-M1-01…06 |
| AC-2 | Goods receipt reconciles with ordered qty, incl. partial | US-M2-03, US-M1-07 |
| AC-3 | Stock movements record actor, timestamp, reference, reason | US-M2-04 |
| AC-4 | Invalid transfers, unauthorised adjustments, negative stock rejected | US-M2-05, US-M2-06 |
| AC-5 | Vehicle allocation validates availability/capacity, prevents conflicts | US-M3-03, US-M3-04 |
| AC-6 | Delivery: dispatch, site receipt, partial acceptance, shortage/damage, POD | US-M3-05…07 |
| AC-7 | Project/location-scoped dashboards & reports | US-M4-02, US-M4-03 |
| AC-8 | AI uses approved data, exposes evidence, respects access | US-M4-05, US-M4-06 |
| AC-9 | AI failure does not stop core workflows | US-M4-07 |
| AC-10 | Audit, backup, restore, security, performance tests documented | US-M4-08 |

## 4. Repository structure decision (Day 001)

The handbook's Day 001 seed says `git init`, plus `docs` and `evidence` folders. The repo already exists (`main`, `Branch-Saiyaf`, `feature/frontend`). The `docs/` folder exists and `evidence/` has now been added for Sprint 1 notes. The handbook names `apps/web` and `apps/api/db/`. **This repo uses `frontend/` and `database/migrations/`.** The team keeps the current layout and records the difference here (decision log D-004).

## 5. Unresolved

See decision log Q-401…Q-407 (mentor/client-level questions).

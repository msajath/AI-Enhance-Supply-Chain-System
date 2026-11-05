# 08 — User Stories, Priorities, Dependencies & Jira Epics

**Cards (Day 007):** QOR-01-07-M1 · M2 · M3 · M4 · **Status:** Drafted. The Jira project is not yet configured in a real workspace; the IDs below are the handbook's example IDs (handbook p.4).

Priority: **M** Must · **S** Should · **C** Could. Size: story points (Fibonacci), team estimate before mentor review.

## Jira epics (proposed)

| Epic | Name | Owner | Sprints |
| :--- | :--- | :--- | :--- |
| E01-FND | Foundation & access (auth, scopes, setup, CI) | M4 + M1 | 02 |
| E02-PROC | Procurement & suppliers | M1 | 03–04 |
| E03-INV | Materials & inventory | M2 | 03–06 |
| E04-LOG | Fleet, equipment & delivery | M3 | 03–07 |
| E05-RPT | Dashboards, alerts, reports, costs | M4 | 06–08 |
| E06-AI | AI capability & governance | M4 | 09–10 |
| E07-SEC | Security, performance, recovery | All | 11 |
| E08-RELEASE | Hardening, UAT, handover | All | 12 |

## Member 1 — Enterprise & Procurement

| ID | Story | Pri | Pts | Depends on | Acceptance (see `06`) |
| :--- | :--- | :- | :- | :--- | :--- |
| US-M1-01 | As an **admin**, I want to create projects and sites so that materials and deliveries can be assigned to them. | M | 3 | E01 | Unique code per company |
| US-M1-02 | As an **admin**, I want to give users access to specific projects so that they only see their own data. | M | 5 | US-M1-01 | Cross-project request denied |
| US-M1-03 | As a **procurement officer**, I want to register and approve suppliers so that only vetted suppliers can quote. | M | 3 | E01 | TC-QT-02 |
| US-M1-04 | As a **site engineer**, I want to raise a requisition with several material lines so that procurement knows what I need and by when. | M | 5 | US-M2-01 | TC-PR-01…03 |
| US-M1-05 | As an **approver**, I want to approve or reject requisitions with a reason, within my limit, so that spending is controlled. | M | 5 | US-M1-04 | TC-PR-04…07 |
| US-M1-06 | As a **procurement officer**, I want to record quotations and compare them so that I can choose the best supplier. | M | 5 | US-M1-03, 05 | TC-QT-01…03 |
| US-M1-07 | As a **procurement officer**, I want to create a PO from approved lines and track ordered/received/outstanding so that nothing is lost. | M | 8 | US-M1-06 | TC-PO-01…03 |
| US-M1-08 | As an **auditor**, I want to see approval history for each PR/PO so that I can verify separation of duties. | S | 3 | US-M4-01 | |

## Member 2 — Materials & Inventory

| ID | Story | Pri | Pts | Depends on | Acceptance |
| :--- | :--- | :- | :- | :--- | :--- |
| US-M2-01 | As a **warehouse manager**, I want a material master with codes, units and reorder levels so that everyone uses the same items. | M | 3 | E01 | Unique code |
| US-M2-02 | As an **admin**, I want to define warehouses (central/regional/site) and assign warehouse users so that stock is location-scoped. | M | 3 | US-M1-01 | TC-TR-03 |
| US-M2-03 | As a **warehouse officer**, I want to receive goods against a PO with accepted/rejected quantities so that stock and PO stay reconciled. | M | 8 | US-M1-07 | TC-GR-01…03 |
| US-M2-04 | As a **warehouse manager**, I want every stock change in a ledger with actor, time, reference and reason so that stock is traceable. | M | 5 | US-M2-03 | TC-INV-03 |
| US-M2-05 | As a **storekeeper**, I want to reserve and issue stock to a project without going negative so that we never promise stock we do not have. | M | 5 | US-M2-04 | TC-INV-01, 02 |
| US-M2-06 | As a **warehouse officer**, I want to transfer stock between warehouses so that shortages can be balanced. | M | 5 | US-M2-04 | TC-TR-01…03 |
| US-M2-07 | As a **warehouse manager**, I want counts with approval-controlled adjustments so that discrepancies are corrected safely. | S | 5 | US-M2-04 | TC-CNT-01, 02 |
| US-M2-08 | As a **warehouse manager**, I want low-stock alerts so that I can request replenishment in time. | M | 3 | US-M2-04, US-M4-04 | TC-RL-01 |

## Member 3 — Fleet & Delivery

| ID | Story | Pri | Pts | Depends on | Acceptance |
| :--- | :--- | :- | :- | :--- | :--- |
| US-M3-01 | As a **fleet manager**, I want to register vehicles with capacity and status so that only suitable vehicles are used. | M | 3 | E01 | capacity_kg > 0 |
| US-M3-02 | As a **fleet manager**, I want to register drivers with licence expiry so that unqualified drivers are not assigned. | M | 3 | E01 | TC-VA-07 |
| US-M3-03 | As a **logistics coordinator**, I want to create transport requests linked to a PO, transfer or site need so that every trip has a reason. | M | 3 | US-M2-05 | |
| US-M3-04 | As a **logistics coordinator**, I want to assign a vehicle and driver for a time window, with capacity/maintenance/overlap checks, so that schedules never conflict. | M | 8 | US-M3-01…03 | TC-VA-01…06 |
| US-M3-05 | As a **warehouse officer**, I want to dispatch a delivery, which issues stock, so that stock and transport stay in sync. | M | 5 | US-M3-04, US-M2-05 | |
| US-M3-06 | As a **site storekeeper**, I want to record accepted/damaged/short quantities and proof of delivery so that discrepancies are visible. | M | 5 | US-M3-05 | TC-DL-01…03 |
| US-M3-07 | As a **driver**, I want to see only my trips and record POD so that I can complete my route. | M | 3 | US-M3-05 | TC-DL-04 |
| US-M3-08 | As a **fleet manager**, I want to block vehicles in maintenance so that unsafe vehicles are not assigned. | M | 2 | US-M3-01 | TC-VA-03 |

## Member 4 — Reports, AI, Security & Platform

| ID | Story | Pri | Pts | Depends on | Acceptance |
| :--- | :--- | :- | :- | :--- | :--- |
| US-M4-01 | As an **auditor**, I want an audit event for every create/approve/stock change so that actions are accountable. | M | 5 | E01 | Audit row per write |
| US-M4-02 | As an **executive**, I want a dashboard of stock, open POs, deliveries and pending approvals scoped to my access. | M | 5 | E02–E04 | Totals = DB queries |
| US-M4-03 | As a **project manager**, I want reports filtered by project, site, warehouse and date so that I can track my project. | M | 5 | US-M4-02 | Date range mandatory |
| US-M4-04 | As a **user**, I want deduplicated alerts (low stock, approvals, overdue PO, delays) so that I act on time. | M | 5 | E03 | One alert per dedupe key |
| US-M4-05 | As a **project manager**, I want a shortage-risk forecast per material and site, with uncertainty and evidence, so that I can order early. | M | 8 | E03 data | Chronological evaluation |
| US-M4-06 | As a **user**, I want to ask questions in plain language and get role-scoped answers with evidence so that I find information fast. | S | 8 | US-M4-02 | No invented figures |
| US-M4-07 | As an **operator**, I want core workflows to keep working when AI is down so that operations never stop. | M | 3 | US-M4-05 | Fault-injection test |
| US-M4-08 | As the **team**, we want security, load and restore tests documented so that the client can trust the release. | M | 8 | All | `06` §4 |
| US-M4-09 | As a **developer**, I want CI to run lint, typecheck, tests and build on every PR so that main stays green. | M | 2 | — | **Exists** |

## Dependency order (critical path)

`E01 access & scopes` → `master data (projects, suppliers, materials, warehouses, vehicles)` → `PR → approval → PO` → `goods receipt + ledger` → `reserve/issue/transfer` → `transport + assignment` → `dispatch → site receipt` → `dashboards/alerts` → `AI`

# 05 — Permission Matrix & Cross-Module API Draft

**Card:** QOR-01-04-M4 (Day 004) · **Owner:** Member 4 · **Status:** Proposed. Roles are pending Q-402.

## 1. Permission matrix (proposed)

Legend: **C** create · **R** read · **U** update · **A** approve · **—** none · *(s)* = scoped to the user's assigned projects/warehouses only.

| Capability | Sys Admin | Exec / SC Mgr | Procurement | Warehouse | Fleet / Maint. | Logistics | Project / Site Eng. | Site Storekeeper | Finance | Driver | Auditor |
| :--- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Users, roles, scopes | CRUD | R | — | — | — | — | — | — | — | — | R |
| Company / project / site / warehouse setup | CRUD | R | R | R(s) | R | R | R(s) | R(s) | R | — | R |
| Approval policy config | CRUD | R | R | — | — | — | — | — | R | — | R |
| Supplier records | R | R | CRU, A (approve/suspend) | — | — | — | — | — | R | — | R |
| Purchase requisition | R | R | R, U | R(s) | — | — | C, R(s) | C, R(s) | R | — | R |
| Approve PR | — | A | A (≤ limit) ⚠ Q-101 | — | — | — | A(s) ⚠ | — | — | — | — |
| RFQ / quotation | R | R | CRU | — | — | — | R(s) | — | R | — | R |
| Purchase order | R | R | CRU | R(s) | — | R(s) | R(s) | — | R | — | R |
| Approve PO | — | A | A (≤ limit, not own) | — | — | — | — | — | — | — | — |
| Material master | CRUD | R | R | CRU | R | R | R | R | R | — | R |
| Goods receipt | — | R | R | C, R(s) | — | — | R(s) | C, R(s) | R | — | R |
| Stock issue / reserve / transfer | — | R | R | C(s) | — | R(s) | request(s) | C(s) | R | — | R |
| Stock adjustment / count approval | — | A | — | C(s), A(s) ⚠ Q-203 | — | — | — | C(s) | R | — | R |
| Vehicle / equipment / maintenance | CRUD | R | — | — | CRUD | R | R(s) | — | R | — | R |
| Transport request | — | R | C | C(s) | R | CRU | C(s) | C(s) | R | — | R |
| Assign vehicle / driver | — | R | — | — | R | C, U | — | — | — | — | R |
| Dispatch / POD / site receipt | — | R | — | dispatch(s) | — | U | site receipt(s) | site receipt(s) | — | POD (own trips) | R |
| Cost reports | — | R | R | — | R | — | R(s) | — | R | — | R |
| Dashboards | R | R | R | R(s) | R | R | R(s) | R(s) | R | own trips | R |
| AI assistant | R | R | R | R(s) | R | R | R(s) | R(s) | R | — | R |
| Audit log | R | R | — | — | — | — | — | — | R | — | R |

**Hard rules (server-enforced):**
1. Every query filters by the `company_id` from the session, plus the user's project and warehouse scope. A cross-project request returns **404** (we do not reveal that the record exists), or 403 where the API style is agreed.
2. Approver ≠ creator for PR, PO and stock adjustments (separation of duties).
3. The approval limit is checked against the value **computed on the server**.
4. A driver can only read or update deliveries assigned to them.
5. AI endpoints reuse the same scope checks and have read-only tools.

## 2. Mapping current repo roles → SRS roles (proposal for Q-402)

| Repo role (`users.role`) | Shown as | Proposed SRS equivalent |
| :--- | :--- | :--- |
| ADMIN | Admin | System Administrator (and acts as Exec until split) |
| WAREHOUSE_MANAGER | Warehouse manager | Warehouse Manager / Officer |
| DRIVER | Driver | Driver / Operator |
| *(to add)* | — | PROCUREMENT, LOGISTICS, FLEET, SITE_ENGINEER, STOREKEEPER, FINANCE, AUDITOR, EXECUTIVE |

## 3. Cross-module API draft (REST, `/api/v1`)

Envelope: `{ success, message?, data, error?: { code, message, details? }, timestamp }` (already implemented in `apps/api/src/utils/apiResponse.ts`).
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT` (state or overlap), `422 BUSINESS_RULE`, `429 RATE_LIMITED`.
Writes that move stock or create receipts accept an `Idempotency-Key` header.

| Owner | Method & path | Purpose | Key rules |
| :--- | :--- | :--- | :--- |
| M1/M4 | `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` | Session (**exists**) | Rate limited |
| M1 | `GET/POST /projects`, `GET/POST /sites` | Enterprise setup | Admin only for writes |
| M1 | `GET/POST /suppliers`, `POST /suppliers/:id/approve`, `/suspend`, `/reactivate` | Supplier lifecycle | |
| M1 | `POST /requisitions`, `GET /requisitions?projectId&status` | PR | Scoped |
| M1 | `POST /requisitions/:id/submit`, `/approve`, `/reject` | PR workflow | Not self-approve |
| M1 | `POST /rfqs`, `POST /rfqs/:id/quotations`, `GET /rfqs/:id/comparison` | RFQ & comparison | Approved suppliers only |
| M1 | `POST /purchase-orders`, `POST /purchase-orders/:id/approve`, `GET /purchase-orders/:id` | PO | Qty ≤ PR outstanding |
| M2 | `GET/POST /materials`, `GET/POST /warehouses` | Master data | |
| M2 | `POST /goods-receipts` | Receipt against a PO | Idempotent, ≤ outstanding |
| M2 | `GET /stock?warehouseId&materialId`, `GET /stock/movements` | Balances & ledger | Scoped |
| M2 | `POST /stock/issues`, `/reservations`, `/transfers`, `/adjustments`, `/counts` | Movements | No negative stock. Adjustments need approval |
| M3 | `GET/POST /vehicles`, `/drivers`, `/equipment`, `/maintenance-orders` | Fleet master | |
| M3 | `POST /transport-requests` | Request transport | Linked source |
| M3 | `POST /deliveries`, `POST /deliveries/:id/dispatch` | Assign & dispatch | Capacity, status and overlap checks → 409/422 |
| M3 | `POST /deliveries/:id/site-receipt`, `POST /deliveries/:id/pod` | Site acceptance | Quantities reconcile |
| M4 | `GET /dashboard/summary?scope`, `GET /reports/:type?from&to&projectId` | Reporting | Verified totals, date range required |
| M4 | `GET /alerts`, `POST /alerts/:id/ack` | Alerts | Deduplicated |
| M4 | `POST /ai/ask` | AI assistant | Read-only tools, schema-validated, logged, fallback |
| M4 | `GET /health` (**exists**), `GET /ready` | Ops | |

**Contract owners review each other's endpoints before any dependent coding** (handbook Git rule). For example, M3 reviews `POST /stock/issues` because dispatch depends on it.

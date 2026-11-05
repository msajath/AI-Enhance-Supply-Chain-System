# 07 — ERD Review & Migration Boundaries

**Cards (Day 006):** QOR-01-06-M1 (procurement relationships & item lines) · QOR-01-06-M2 (stock balances, reservations, location scope) · QOR-01-06-M3 (assignments, delivery items, site receipt) · QOR-01-06-M4 (FK naming, ownership, migration boundaries)
**Status:** Review completed against the handbook's starter schema (`001_mvp.sql` listing, handbook pp. 156–159) and the repo's actual migration. **The handbook's 65-table `reference/` file is not in this repo**, so the review used the 26/24-table starter listing printed in the handbook. Getting the reference file is recorded as an open action.

## 1. What the repo has today vs. the handbook starter

| Repo (`database/migrations/001_sprint1_foundation.sql`) | Handbook starter equivalent | Gap / decision |
| :--- | :--- | :--- |
| `organizations` | `company` | Naming differs ⚠ Q-401 |
| `users` (single `role` column, `organization_id` nullable) | `app_user` + `user_role` (multi-role), `company_id NOT NULL` | Users can exist without a company in the repo. Proposal: make it NOT NULL in migration 002 |
| `warehouses` (code globally unique) | `warehouse` (+ `project_id`, `UNIQUE(id, company_id)`) | Code should be unique per company, not globally |
| `fleet_vehicles` (`capacity_tons`, status free text) | `vehicle` (`capacity_kg > 0`, status CHECK) | Use kg plus a CHECK constraint (A-301) |
| `system_audit_logs` | `audit_event` | Add `company_id`, `target_table`, `target_id` |
| — | `project`, `user_project_access`, `user_warehouse_access` | **Missing.** Needed for the Sprint 2 "cross-project access denied" gate |
| — | `supplier`, `requisition(_item)`, `purchase_order(_item)`, `goods_receipt(_item)` | Sprint 3–4 |
| — | `material`, `stock_balance`, `stock_movement`, `stock_transfer` | Sprint 3–5 |
| — | `driver`, `transport_request`, `delivery(_item)`, `site_receipt` | Sprint 3–7 |

## 2. Procurement relationships (Member 1)

- `requisition 1—* requisition_item`; `purchase_order *—1 supplier`; `purchase_order_item *—1 requisition_item`. This lets one PR line be covered by several PO lines (partial ordering) ✓.
- **Finding:** the starter `purchase_order.status` has only OPEN, PARTIAL and COMPLETE. It needs DRAFT, PENDING_APPROVAL and CANCELLED for the approval workflow (see `03` §1).
- **Finding:** there are no `rfq` or `quotation_item` tables in the starter. Quotation-to-PR-line linkage is needed for comparison (R-PRC-03).
- **Finding:** `requisition` has no `company_id`. Scope is derived through `project`. We accept this only if every query joins through project. Proposal: add `company_id` and a composite FK `(project_id, company_id)` so tenancy is enforced in the DB.
- Invariant to enforce in the service plus a DB trigger or check: Σ PO qty per PR line ≤ PR line qty.

## 3. Stock balances, reservations & location scope (Member 2)

- `stock_balance` PK `(warehouse_id, material_id)` with `CHECK(on_hand ≥ 0)` and `CHECK(reserved ≤ on_hand)` ✓. This matches A-203.
- **Finding:** there is no `quarantined` column and no separate reservation table. If reservations must be per project or expire (W7), add a `stock_reservation` table instead of a bare `reserved` number.
- `stock_movement` is append-only with `delta_qty <> 0` and a reference ✓. **Add** `movement_type` and `reason` (needed by AC-3).
- `stock_transfer` has `CHECK(from ≠ to)` and an idempotent `request_key` ✓. In-transit status depends on W9.
- Location scope: `user_warehouse_access` is the scope source. Bins (`storage_location`) are deferred (Could).

## 4. Assignments, delivery items & site receipt (Member 3)

- `delivery` has `CHECK(end_at > start_at)` and an index on `(vehicle_id, start_at, end_at)` ✓. **Overlap must be enforced in the DB**. Proposal: `btree_gist` exclusion constraints `EXCLUDE USING gist (vehicle_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status NOT IN ('CANCELLED'))`, and the same for `driver_id`. Without this, two simultaneous requests can both pass a service-level check.
- `site_receipt` has `accepted_qty` and `damaged_qty`. **Add** `short_qty` and a check `accepted + damaged + short = delivery_item.quantity` (via a trigger, since it crosses tables). Proof of delivery is a separate table (Q-302).
- No equipment or maintenance tables yet. A-303 needs `maintenance_order` or the vehicle status.

## 5. FK naming, ownership & migration boundaries (Member 4)

| Topic | Proposal |
| :--- | :--- |
| Table names | Singular snake_case (`purchase_order`) for new tables. Pending Q-401, decide whether to rename the existing plural tables in migration 002 (cheap now, expensive later) |
| FK names | `<referenced_table>_id`. Constraint names `fk_<table>_<column>` and `ck_<table>_<rule>` |
| Tenancy | Every tenant table has `company_id NOT NULL`, plus `UNIQUE(id, company_id)` on parents so children can use composite FKs |
| Ownership | M1: company, project, site, user/role/access, supplier, PR/RFQ/quotation/PO. M2: material, uom, warehouse, stock_*, goods_receipt. M3: vehicle, driver, equipment, maintenance, transport/delivery/site_receipt/POD. M4: audit_event, alert, ai_request/review, cost views |
| Boundaries | `001_sprint1_foundation.sql` is frozen once shared. Each change goes in `00N_<owner>_<topic>.sql`, reviewed by the owning member plus one other. Never run the 65-table reference file beside the migrations |
| Migration runner | `scripts/migrate.ts` records versions in `schema_migrations` ✓. Add a "down" or rollback note per migration |

## 6. Open actions

| # | Action | Owner |
| :- | :--- | :--- |
| 1 | Get `reference/65-table-proposed-schema.sql` from the handbook companion ZIP and commit it to `docs/reference/` (read-only, never executed) | M4 |
| 2 | Mentor decision on Q-401 (rename to singular / company) | M4 |
| 3 | Draft `002_*` migration in Sprint 2 (project, access tables, company_id NOT NULL) | M1 + M4 |

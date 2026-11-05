# 09 — Demo Fixtures & Data-Governance Checklist

**Cards (Day 008):** QOR-01-08-M1 (supplier/approval mock data & policy exceptions) · M2 (materials, units, two warehouses, initial stock) · M3 (vehicles, drivers, delivery fixtures) · M4 (2-project fixture plan & governance checklist)
**Status:** Proposed. **All data is synthetic.** Names, plates and phone numbers are invented and do not refer to real companies or people. Volumes are pending Q-406.

## 1. Two-project fixture plan (Member 4)

| Entity | Records |
| :--- | :--- |
| Company | `QZC` Qorvenz Demo Construction (Pvt) Ltd ¹ |
| Projects | `PRJ-GAL` Galle Road Apartments · `PRJ-MAT` Matara Bridge Rehabilitation |
| Sites | `SITE-GAL-01` (PRJ-GAL), `SITE-MAT-01` (PRJ-MAT) |
| Warehouses | `WH-CEN` Central Warehouse (Colombo, CENTRAL) ² · `WH-MAT` Matara Site Store (SITE, PRJ-MAT) |
| Users (one per role, synthetic emails `@demo.qorvenz.test`) | admin, exec, procurement, procurement.approver, warehouse.cen, storekeeper.mat, logistics, fleet, site.engineer.gal, site.engineer.mat, finance, driver.1, driver.2, auditor |
| Scopes | site.engineer.gal → PRJ-GAL only; storekeeper.mat → WH-MAT only. This proves cross-project denial |

**Implementation status (2026-11-05, Jira AESCS-41/161):** `database/seeds/002_sprint1_org_structure.sql` and `scripts/seed.ts` create the projects, sites and warehouses above. They also create the users whose roles exist in code today:

* `admin`: ADMIN, company-wide.
* `warehouse.cen`: WAREHOUSE_MANAGER on PRJ-GAL + PRJ-MAT and WH-CEN.
* `storekeeper.mat`: WAREHOUSE_MANAGER standing in for STOREKEEPER, on PRJ-MAT + WH-MAT only. This is the cross-project denial case.
* `driver.1`, `driver.2`: DRIVER.

The remaining users (exec, procurement, procurement.approver, logistics, fleet, site.engineer.gal/mat, finance, auditor) are added when their roles are (Q-402). Each user gets an individual password; there are no shared demo passwords.

¹ The database keeps the company record that `001_sprint1_seed.sql` already created (`QOR-HQ-01`, "Qorvenz Construction Infrastructure Ltd."). Renaming it would break existing team databases. Switch to `QZC` only if the mentor asks (Q-406).
² `WH-CEN` is the existing `WH-CENTRAL-01` record ("Central Cement & Aggregates Yard") from `001_sprint1_seed.sql`.

## 2. Suppliers & approval exceptions (Member 1)

| Code | Supplier (fictional) | Category | Status | Purpose in demo |
| :--- | :--- | :--- | :--- | :--- |
| SUP-001 | Lanka Steel Traders | Steel | APPROVED | Winning quotation |
| SUP-002 | Southern Cement Distributors | Cement, aggregates | APPROVED | Competing quotation |
| SUP-003 | Quickbuild Supplies | Mixed | SUSPENDED | Proves an unapproved supplier is rejected (TC-QT-02) |

Approval thresholds for the demo **are placeholders, not client policy** (⚠ Q-101): PR ≤ LKR 1,000,000 → procurement.approver; above that → exec. Edge cases in the fixtures: a self-approval attempt, a PR rejected without a reason, and a PO above the limit.

## 3. Materials, units, warehouses & initial stock (Member 2)

| Code | Material | Unit | kg/unit | Reorder | WH-CEN | WH-MAT |
| :--- | :--- | :--- | :- | :- | :- | :- |
| MAT-STL-12 | Steel rebar 12 mm | ton | 1000 | 5 | 8.0 | 1.0 |
| MAT-STL-16 | Steel rebar 16 mm | ton | 1000 | 3 | 4.0 | 0 |
| MAT-CEM-50 | Portland cement 50 kg | bag | 50 | 200 | 1,240 | 150 |
| MAT-SND-RV | River sand | m³ | 1600 | 20 | 46 | 12 |
| MAT-AGG-20 | Aggregate 20 mm | m³ | 1500 | 20 | 60 | 0 |
| MAT-BRK-ST | Standard brick | piece | 3 | 5,000 | 18,000 | 2,000 |

WH-MAT steel 12 mm (1.0 t) is below reorder (5 t). That triggers the demo's low-stock alert and the requisition.

## 4. Vehicles, drivers & delivery fixtures (Member 3)

| Plate (fictional) | Type | Capacity kg | Status | Purpose |
| :--- | :--- | :- | :--- | :--- |
| DEMO-LR-01 | Lorry | 8,000 | AVAILABLE | Happy-path assignment |
| DEMO-TP-02 | Tipper | 12,000 | MAINTENANCE | Proves a blocked assignment (TC-VA-03) |
| DEMO-PK-03 | Pickup | 1,000 | AVAILABLE | Proves a capacity rejection (TC-VA-02) |

| Driver | Licence expiry | Purpose |
| :--- | :--- | :--- |
| Driver One | 2028-06-30 | Happy path |
| Driver Two | 2026-09-30 (expired) | Proves an expired-licence rejection (TC-VA-07) |

Delivery fixture: 6 t steel 12 mm WH-CEN → SITE-MAT-01, 09:00–12:00. Site accepts 5.8 t, 0.2 t damaged → PARTIAL (TC-DL-02). A second booking for DEMO-LR-01 at 11:00 is rejected (TC-VA-04).

## 5. Data-governance checklist

| # | Check | Status |
| :- | :--- | :--- |
| 1 | No real customer, supplier or personal data in the repo, seeds or screenshots | ✅ Synthetic only |
| 2 | Demo email domain is reserved/non-routable (`.test`) | ✅ Proposed |
| 3 | No passwords in fixtures. Seed script reads demo passwords from `.env` | ✅ The hashed shared password was removed from `001_sprint1_seed.sql`. `scripts/seed.ts` reads optional `SEED_PASSWORD_*` values or generates one per user, and disables the old `admin@qorvenz.local` account if it still has the shared password |
| 4 | `.env` git-ignored; `.env.example` has placeholders only | ✅ (per `ENVIRONMENT_VERIFICATION.md` #14) |
| 5 | Personal fields (supplier contact, driver licence) visible only to authorised roles | Planned, permission matrix `05` |
| 6 | Retention: demo data can be wiped and reseeded at any time; no backups of real data | Proposed |
| 7 | AI requests never send personal fields to an external model | Planned (E06) |
| 8 | If the client provides real sample data (Q-406): store it outside git, anonymise it, and get written permission | OPEN |

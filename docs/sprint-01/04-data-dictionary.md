# 04 — Data Dictionary (proposed fields)

**Cards:** QOR-01-04-M1 (requisition, RFQ, quotation, PO) · QOR-01-04-M2 (material, warehouse, location, movement) · QOR-01-04-M3 (vehicle, equipment, assignment, POD)
**Status:** Proposed. These are logical fields. Physical names are settled in the ERD review (`07`).

Conventions: `id UUID PK`. Every tenant-owned record has a `company_id` FK. `created_at` and `created_by` are on all transactional rows. Quantities are `NUMERIC(14,3)` and money is `NUMERIC(14,2)`. **Req** = required.

## 1. Procurement (Member 1)

### requisition
| Field | Type | Req | Rule / note |
| :--- | :--- | :- | :--- |
| id | UUID | ✓ | |
| company_id | UUID FK | ✓ | Taken from the session, never from the browser |
| project_id | UUID FK | ✓ | The requester must have access to this project |
| site_id | UUID FK | | Delivery site ⚠ A-101 |
| reference_no | text | ✓ | Unique per company, e.g. PR-2026-0001 |
| status | enum | ✓ | DRAFT, SUBMITTED, APPROVED, REJECTED, PARTIALLY_ORDERED, ORDERED, CLOSED, CANCELLED |
| needed_by | date | ✓ | Must be today or later at submit time |
| requested_by | UUID FK user | ✓ | |
| approved_by / approved_at | UUID / timestamptz | | Must differ from requested_by |
| rejection_reason | text | | Required when REJECTED |
| notes | text | | |

### requisition_item
| Field | Type | Req | Rule |
| :--- | :--- | :- | :--- |
| requisition_id | UUID FK | ✓ | |
| material_id | UUID FK | ✓ | Active material in the same company |
| quantity | numeric | ✓ | > 0 |
| unit | text | ✓ | Must be a valid unit for the material |
| specification | text | | |

### rfq · quotation · quotation_item
| Field | Type | Req | Rule |
| :--- | :--- | :- | :--- |
| rfq.requisition_id | UUID FK | ✓ | PR must be APPROVED |
| rfq.due_date | date | ✓ | |
| quotation.supplier_id | UUID FK | ✓ | Supplier must be APPROVED (not suspended) |
| quotation.valid_until | date | ✓ | |
| quotation.lead_time_days | int | ✓ | ≥ 0 |
| quotation.delivery_terms | text | | |
| quotation.document_id | UUID FK | | Uploaded PDF (planned) |
| quotation_item.requisition_item_id | UUID FK | ✓ | |
| quotation_item.unit_price | numeric(14,2) | ✓ | ≥ 0 |
| quotation_item.quantity | numeric | ✓ | > 0 |

### purchase_order · purchase_order_item
| Field | Type | Req | Rule |
| :--- | :--- | :- | :--- |
| po.reference_no | text | ✓ | Unique per company |
| po.supplier_id | UUID FK | ✓ | Exactly one supplier ⚠ A-103 |
| po.quotation_id | UUID FK | | The selected quotation |
| po.status | enum | ✓ | DRAFT, PENDING_APPROVAL, OPEN, PARTIAL, COMPLETE, CANCELLED |
| po.total_value | numeric(14,2) | ✓ | Computed by the server from the lines |
| po.approved_by | UUID FK | | ≠ created_by |
| poi.requisition_item_id | UUID FK | ✓ | Sum of PO quantities ≤ PR line quantity |
| poi.quantity / unit_price | numeric | ✓ | > 0 / ≥ 0 |
| poi.received_qty | derived | | Sum of accepted goods-receipt quantities, never typed by a user |

### supplier
| Field | Type | Req | Rule |
| :--- | :--- | :- | :--- |
| name, code | text | ✓ | Code unique per company |
| status | enum | ✓ | PENDING, APPROVED, SUSPENDED |
| categories | text[] | | Material categories supplied |
| contact_name, phone, email | text | | Personal data: only visible to procurement roles |
| certifications | text | | |

## 2. Materials & inventory (Member 2)

| Entity | Key fields | Rules |
| :--- | :--- | :--- |
| material | code, name, category, base_unit, unit_weight_kg, specification, reorder_level, min_level, max_level, tracking (none/batch/serial/expiry), active | Code unique per company. unit_weight_kg > 0 (needed for vehicle capacity, A-301) |
| unit_conversion | material_id, from_unit, to_unit, factor | factor > 0 ⚠ A-202 |
| warehouse | code, name, type (CENTRAL/REGIONAL/SITE), project_id (for site stores), address, active | ⚠ A-201 |
| storage_location | warehouse_id, code (zone/rack/bin) | Optional, Could priority |
| stock_balance | warehouse_id, material_id, on_hand, reserved, quarantined | on_hand ≥ 0, reserved ≤ on_hand. Primary key is (warehouse, material) |
| stock_movement | warehouse_id, material_id, delta_qty, movement_type (RECEIPT, ISSUE, RETURN, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, RESERVE, RELEASE), reference_type, reference_id, reason, actor_id, created_at | Append-only, delta ≠ 0. ADJUSTMENT requires a reason and an approver |
| goods_receipt | purchase_order_id, warehouse_id, received_by, request_key, received_at | request_key unique (idempotent) |
| goods_receipt_item | po_item_id, accepted_qty, rejected_qty, rejection_reason | accepted + rejected > 0, and ≤ outstanding |
| stock_transfer | from_warehouse_id, to_warehouse_id, material_id, quantity, status, request_key | from ≠ to, quantity > 0 |
| stock_count | warehouse_id, counted_by, approved_by, lines (material, system_qty, counted_qty) | Difference creates an ADJUSTMENT only after approval (Q-203) |

## 3. Fleet & delivery (Member 3)

| Entity | Key fields | Rules |
| :--- | :--- | :--- |
| vehicle | plate, type, capacity_kg, capacity_m3, ownership (OWNED/HIRED), status (AVAILABLE/MAINTENANCE/INACTIVE), odometer_km | Plate unique per company. capacity_kg > 0 |
| equipment | code, type (excavator, crane, forklift, loader, mixer), status, project_id, operating_hours | |
| driver | name, licence_no, licence_class, licence_expiry, active, user_id (optional) | licence_no unique. An expired licence cannot be assigned |
| maintenance_order | vehicle_id / equipment_id, type (PREVENTIVE/REPAIR), due_at, status, cost | Open or overdue blocks assignment ⚠ A-303 |
| transport_request | project_id, site_id, source_type (PO/TRANSFER/ISSUE), source_id, warehouse_id, required_by, notes | |
| delivery (assignment) | transport_request_id, vehicle_id, driver_id, start_at, end_at, status (PLANNED, DISPATCHED, DELIVERED, PARTIAL, FAILED, CANCELLED) | end_at > start_at. No overlap per vehicle or driver. Load weight ≤ capacity |
| delivery_item | delivery_id, material_id, quantity | quantity > 0 |
| site_receipt | delivery_item_id, accepted_qty, damaged_qty, short_qty, receiver_name, received_at, remarks | accepted + damaged + short = dispatched |
| proof_of_delivery | delivery_id, recipient_name, signed_at, photo_ids, gps (optional) | ⚠ Q-302 |
| fuel_log | vehicle_id, litres, cost, odometer_km, filled_at | Should priority |

## 4. Cross-cutting (Member 4)

| Entity | Key fields |
| :--- | :--- |
| audit_event | company_id, actor_id, action, target_table, target_id, before/after (JSON), created_at |
| alert | company_id, type (LOW_STOCK, PENDING_APPROVAL, OVERDUE_PO, DELIVERY_DELAY, MAINTENANCE_DUE), target, status, dedupe_key |
| ai_request | company_id, user_id, intent, tool_calls, response_json, model_version, prompt_version, evidence_ids, latency_ms, created_at |
| ai_review | ai_request_id, reviewer_id, decision, comment |

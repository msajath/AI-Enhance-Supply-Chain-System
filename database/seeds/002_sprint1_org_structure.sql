-- ==============================================================================
-- QORVENZ TECH — SPRINT 1 SEED: projects, sites, departments, warehouses
-- Jira: AESCS-41 / AESCS-161 (Member 2)
-- Implements the Sprint 1 two-project fixture plan:
--   docs/sprint-01/09-demo-fixtures-and-data-governance.md §1 (decision D-012)
--   * Company      = existing QOR-HQ-01 record from 001_sprint1_seed.sql (see §1 note)
--   * Projects     = PRJ-GAL Galle Road Apartments · PRJ-MAT Matara Bridge Rehabilitation
--   * Sites        = SITE-GAL-01 (PRJ-GAL) · SITE-MAT-01 (PRJ-MAT)
--   * Warehouses   = WH-CEN (existing WH-CENTRAL-01, CENTRAL) · WH-MAT Matara Site Store (SITE)
-- Synthetic demo data only. Safe to re-run: every insert is keyed on a business
-- code and references parents by code, so no duplicates and no dangling IDs.
-- Users and their access grants are created by scripts/seed.ts (no shared passwords).
-- ==============================================================================

-- Company (exists from 001; repeated here so this file can run on its own)
INSERT INTO organizations (id, name, code, address)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Qorvenz Construction Infrastructure Ltd.', 'QOR-HQ-01', '100 Engineering Blvd, Colombo')
ON CONFLICT (code) DO NOTHING;

-- Central warehouse (exists from 001 as WH-CENTRAL-01 = the plan's WH-CEN)
INSERT INTO warehouses (id, organization_id, name, code, location, capacity)
SELECT 'c0000000-0000-0000-0000-000000000001', o.id, 'Central Cement & Aggregates Yard', 'WH-CENTRAL-01', 'Sector 4 Logistics Hub', 50000.00
FROM organizations o WHERE o.code = 'QOR-HQ-01'
ON CONFLICT (code) DO NOTHING;

-- Departments / cost centres
INSERT INTO departments (organization_id, code, name, cost_center_code)
SELECT o.id, d.code, d.name, d.cc
FROM organizations o
CROSS JOIN (VALUES
  ('PROC', 'Procurement',             'CC-100'),
  ('WHL',  'Warehouse & Logistics',   'CC-200'),
  ('SITE', 'Site Operations',         'CC-300'),
  ('FIN',  'Finance & Cost Control',  'CC-400')
) AS d(code, name, cc)
WHERE o.code = 'QOR-HQ-01'
ON CONFLICT (organization_id, code) DO NOTHING;

-- Projects (fixture plan §1)
INSERT INTO projects (id, organization_id, code, name, status, start_date, end_date)
SELECT p.id::uuid, o.id, p.code, p.name, p.status, p.start_date::date, p.end_date::date
FROM organizations o
CROSS JOIN (VALUES
  ('e0000000-0000-0000-0000-000000000001', 'PRJ-GAL', 'Galle Road Apartments',        'ACTIVE', '2026-02-01', '2027-09-30'),
  ('e0000000-0000-0000-0000-000000000002', 'PRJ-MAT', 'Matara Bridge Rehabilitation', 'ACTIVE', '2026-04-15', '2027-03-31')
) AS p(id, code, name, status, start_date, end_date)
WHERE o.code = 'QOR-HQ-01'
ON CONFLICT (organization_id, code) DO NOTHING;

-- Sites (fixture plan §1: one per project)
INSERT INTO sites (organization_id, project_id, code, name, address)
SELECT pr.organization_id, pr.id, s.code, s.name, s.address
FROM (VALUES
  ('PRJ-GAL', 'SITE-GAL-01', 'Galle Road Apartments — Main Site', '412 Galle Road, Colombo 03'),
  ('PRJ-MAT', 'SITE-MAT-01', 'Matara Bridge — River Works',       'Nilwala River crossing, Matara')
) AS s(project_code, code, name, address)
JOIN projects pr ON pr.code = s.project_code
JOIN organizations o ON o.id = pr.organization_id AND o.code = 'QOR-HQ-01'
ON CONFLICT (project_id, code) DO NOTHING;

-- Site warehouse WH-MAT (fixture plan §1: SITE store for PRJ-MAT)
INSERT INTO warehouses (organization_id, name, code, location, capacity, warehouse_type, site_id)
SELECT si.organization_id, 'Matara Site Store', 'WH-MAT', 'Matara Bridge — River Works', 2500.00, 'SITE', si.id
FROM sites si
JOIN projects pr ON pr.id = si.project_id AND pr.code = 'PRJ-MAT'
WHERE si.code = 'SITE-MAT-01'
ON CONFLICT (code) DO NOTHING;

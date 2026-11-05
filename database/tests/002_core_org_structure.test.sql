-- ==============================================================================
-- Constraint + integrity test for 002_core_org_structure (AESCS-160 evidence)
-- Run against a DISPOSABLE database after migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/002_core_org_structure.test.sql
-- Every block runs inside a transaction that is rolled back, so no data is kept.
-- Prints "PASS:" lines; any unexpected success or failure aborts the script.
-- ==============================================================================
\set QUIET on
\o /dev/null
BEGIN;

-- Fixtures: two companies, one project each
INSERT INTO organizations (id, name, code) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Test Co A', 'T-A'),
  ('11111111-0000-0000-0000-000000000002', 'Test Co B', 'T-B');
INSERT INTO projects (id, organization_id, code, name) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'P1', 'Project A1'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'P1', 'Project B1');
INSERT INTO users (id, organization_id, email, password_hash, full_name, role) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'a@test.invalid', 'x', 'User A', 'WAREHOUSE_MANAGER');

-- Helper: expect a statement to fail with a given SQLSTATE
CREATE FUNCTION pg_temp.expect_fail(stmt text, expected_state text, label text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'PASS: % (rejected with %)', label, SQLSTATE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % raised % (%), expected %', label, SQLSTATE, SQLERRM, expected_state;
  END;
  RAISE EXCEPTION 'FAIL: % was accepted but should have been rejected', label;
END;
$$ LANGUAGE plpgsql;

-- 23505 unique_violation · 23503 foreign_key_violation · 23514 check_violation · 23502 not_null_violation
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', 'P1', 'dup')$$, '23505', 'duplicate project code in same company');
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name) VALUES ('11111111-0000-0000-0000-0000000000ff', 'P9', 'x')$$, '23503', 'project for unknown company');
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', NULL, 'x')$$, '23502', 'project without code');
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', '  ', 'x')$$, '23514', 'blank project code');
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name, status) VALUES ('11111111-0000-0000-0000-000000000001', 'P2', 'x', 'DONE')$$, '23514', 'invalid project status');
SELECT pg_temp.expect_fail($$INSERT INTO projects (organization_id, code, name, start_date, end_date) VALUES ('11111111-0000-0000-0000-000000000001', 'P3', 'x', '2026-12-01', '2026-01-01')$$, '23514', 'project end before start');

INSERT INTO sites (id, organization_id, project_id, code, name) VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'S1', 'Site A1');
\echo 'PASS: same project code allowed in a different company; valid site created'
SELECT pg_temp.expect_fail($$INSERT INTO sites (organization_id, project_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'S9', 'cross')$$, '23503', 'site linked to another company''s project');
SELECT pg_temp.expect_fail($$INSERT INTO sites (organization_id, project_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'S1', 'dup')$$, '23505', 'duplicate site code in project');
SELECT pg_temp.expect_fail($$DELETE FROM projects WHERE id = '22222222-0000-0000-0000-000000000001'$$, '23503', 'delete project that still has sites');

INSERT INTO departments (organization_id, code, name, cost_center_code) VALUES ('11111111-0000-0000-0000-000000000001', 'PROC', 'Procurement', 'CC-100');
SELECT pg_temp.expect_fail($$INSERT INTO departments (organization_id, code, name) VALUES ('11111111-0000-0000-0000-000000000001', 'PROC', 'dup')$$, '23505', 'duplicate department code');
SELECT pg_temp.expect_fail($$INSERT INTO departments (organization_id, code, name, cost_center_code) VALUES ('11111111-0000-0000-0000-000000000001', 'FIN', 'Finance', 'CC-100')$$, '23505', 'duplicate cost centre code');

INSERT INTO warehouses (id, organization_id, name, code, location, warehouse_type, site_id) VALUES
  ('55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Site store', 'T-WH-S1', 'Site A1', 'SITE', '44444444-0000-0000-0000-000000000001');
\echo 'PASS: SITE warehouse linked to its site'
SELECT pg_temp.expect_fail($$INSERT INTO warehouses (organization_id, name, code, location, warehouse_type) VALUES ('11111111-0000-0000-0000-000000000001', 'x', 'T-WH-X', 'x', 'SITE')$$, '23514', 'SITE warehouse without site');
SELECT pg_temp.expect_fail($$INSERT INTO warehouses (organization_id, name, code, location, warehouse_type, site_id) VALUES ('11111111-0000-0000-0000-000000000001', 'x', 'T-WH-Y', 'x', 'CENTRAL', '44444444-0000-0000-0000-000000000001')$$, '23514', 'CENTRAL warehouse with a site');
SELECT pg_temp.expect_fail($$INSERT INTO warehouses (organization_id, name, code, location, warehouse_type, site_id) VALUES ('11111111-0000-0000-0000-000000000002', 'x', 'T-WH-Z', 'x', 'SITE', '44444444-0000-0000-0000-000000000001')$$, '23503', 'warehouse linked to another company''s site');
SELECT pg_temp.expect_fail($$INSERT INTO warehouses (name, code, location) VALUES ('x', 'T-WH-N', 'x')$$, '23502', 'warehouse without company');

INSERT INTO user_project_access (user_id, project_id, organization_id) VALUES
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
\echo 'PASS: user granted a project in their own company'
SELECT pg_temp.expect_fail($$INSERT INTO user_project_access (user_id, project_id, organization_id) VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001')$$, '23505', 'duplicate project grant');
SELECT pg_temp.expect_fail($$INSERT INTO user_project_access (user_id, project_id, organization_id) VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002')$$, '23503', 'grant another company''s project (claimed org B)');
SELECT pg_temp.expect_fail($$INSERT INTO user_project_access (user_id, project_id, organization_id) VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001')$$, '23503', 'grant another company''s project (claimed org A)');
INSERT INTO user_warehouse_access (user_id, warehouse_id, organization_id) VALUES
  ('33333333-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
\echo 'PASS: user granted a warehouse in their own company'

-- Cascades: deleting a user removes their grants
DELETE FROM users WHERE id = '33333333-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM user_project_access WHERE user_id = '33333333-0000-0000-0000-000000000001')
   + (SELECT count(*) FROM user_warehouse_access WHERE user_id = '33333333-0000-0000-0000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'FAIL: grants not removed with user';
  END IF;
  RAISE NOTICE 'PASS: user deletion cascades to access grants';
END $$;

-- updated_at trigger
UPDATE projects SET updated_at = '2000-01-01' WHERE id = '22222222-0000-0000-0000-000000000002';
UPDATE projects SET name = 'Project B1 renamed' WHERE id = '22222222-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF (SELECT updated_at FROM projects WHERE id = '22222222-0000-0000-0000-000000000002') < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL: updated_at trigger did not fire';
  END IF;
  RAISE NOTICE 'PASS: updated_at trigger refreshes timestamp';
END $$;

-- Indexes required by AESCS-40 acceptance criterion 2
DO $$ DECLARE missing text; BEGIN
  SELECT string_agg(i, ', ') INTO missing FROM unnest(ARRAY[
    'idx_projects_org_status', 'idx_sites_project', 'idx_sites_org', 'idx_departments_org',
    'idx_warehouses_site', 'idx_user_project_access_project', 'idx_user_warehouse_access_warehouse'
  ]) AS i WHERE to_regclass(i) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'FAIL: missing indexes %', missing; END IF;
  RAISE NOTICE 'PASS: company/project/site lookup indexes exist';
END $$;

ROLLBACK;
\echo 'ALL 002 CONSTRAINT TESTS PASSED (transaction rolled back, no data kept)'

-- ==============================================================================
-- ROLLBACK for 002_core_org_structure.sql
-- Run with: npm run db:rollback   (removes the newest applied migration only)
-- WARNING: drops project, site, department and access data.
-- ==============================================================================

DROP INDEX IF EXISTS idx_audit_logs_event_created;

DROP TABLE IF EXISTS user_warehouse_access;
DROP TABLE IF EXISTS user_project_access;

DROP INDEX IF EXISTS idx_warehouses_site;
ALTER TABLE warehouses
  DROP CONSTRAINT IF EXISTS warehouses_site_fk,
  DROP CONSTRAINT IF EXISTS warehouses_id_org_unique,
  DROP CONSTRAINT IF EXISTS warehouses_site_matches_type,
  DROP CONSTRAINT IF EXISTS warehouses_type_valid,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS site_id,
  DROP COLUMN IF EXISTS warehouse_type,
  ALTER COLUMN organization_id DROP NOT NULL;

DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS sites;
DROP TABLE IF EXISTS projects;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_org_unique;
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_name_not_blank,
  DROP CONSTRAINT IF EXISTS organizations_code_not_blank;

DROP FUNCTION IF EXISTS set_updated_at();

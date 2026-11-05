-- ==============================================================================
-- QORVENZ TECH — 002 CORE ORGANISATION STRUCTURE
-- Jira: AESCS-40 / AESCS-160 (Member 2)
-- Adds project, site and department master data plus the warehouse and user
-- access foundation used by the project-scope middleware (AESCS-39, Member 1).
--
-- Rules:
--   * `organizations` is the "company" table. Renaming it is open question Q-401.
--   * Every tenant-owned row carries organization_id. Composite foreign keys
--     (id, organization_id) make it impossible to link a row to a parent that
--     belongs to another company, even if application code has a bug.
--   * Never edit this file after it has been shared. Add 003_... instead.
--   * Rollback: database/migrations/down/002_core_org_structure.sql
--     (npm run db:rollback).
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_code_not_blank CHECK (length(trim(code)) > 0),
  ADD CONSTRAINT organizations_name_not_blank CHECK (length(trim(name)) > 0);

-- Allows composite FKs (user_id, organization_id) from access tables.
ALTER TABLE users
  ADD CONSTRAINT users_id_org_unique UNIQUE (id, organization_id);

-- ---------------------------------------------------------------------------
-- 1. Projects
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT projects_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT projects_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT projects_status_valid   CHECK (status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT projects_dates_valid    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT projects_org_code_unique UNIQUE (organization_id, code),
  CONSTRAINT projects_id_org_unique   UNIQUE (id, organization_id)
);
CREATE INDEX idx_projects_org_status ON projects (organization_id, status);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Sites (a construction site always belongs to exactly one project)
-- ---------------------------------------------------------------------------
CREATE TABLE sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  project_id      UUID NOT NULL,
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  address         TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sites_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT sites_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT sites_status_valid   CHECK (status IN ('ACTIVE', 'INACTIVE', 'CLOSED')),
  CONSTRAINT sites_project_fk FOREIGN KEY (project_id, organization_id)
    REFERENCES projects (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT sites_project_code_unique UNIQUE (project_id, code),
  CONSTRAINT sites_id_org_unique       UNIQUE (id, organization_id)
);
CREATE INDEX idx_sites_project ON sites (project_id);
CREATE INDEX idx_sites_org     ON sites (organization_id);
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Departments / cost centres
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code             VARCHAR(50)  NOT NULL,
  name             VARCHAR(255) NOT NULL,
  cost_center_code VARCHAR(50),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT departments_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT departments_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT departments_org_code_unique        UNIQUE (organization_id, code),
  CONSTRAINT departments_org_cost_center_unique UNIQUE (organization_id, cost_center_code)
);
CREATE INDEX idx_departments_org ON departments (organization_id);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Warehouses: type + optional site link (AESCS-160)
--    Fails loudly if an existing warehouse has no organisation; fix data first.
-- ---------------------------------------------------------------------------
ALTER TABLE warehouses
  ALTER COLUMN organization_id SET NOT NULL,
  ADD COLUMN warehouse_type VARCHAR(20) NOT NULL DEFAULT 'CENTRAL',
  ADD COLUMN site_id        UUID,
  ADD COLUMN is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT warehouses_type_valid CHECK (warehouse_type IN ('CENTRAL', 'REGIONAL', 'SITE')),
  -- A SITE warehouse must point to a site; central/regional ones must not.
  ADD CONSTRAINT warehouses_site_matches_type CHECK ((warehouse_type = 'SITE') = (site_id IS NOT NULL)),
  ADD CONSTRAINT warehouses_id_org_unique UNIQUE (id, organization_id),
  ADD CONSTRAINT warehouses_site_fk FOREIGN KEY (site_id, organization_id)
    REFERENCES sites (id, organization_id) ON DELETE RESTRICT;
CREATE INDEX idx_warehouses_site ON warehouses (site_id) WHERE site_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. User access assignments (scoped access foundation)
--    Composite FKs guarantee user, project/warehouse and grant share one company.
-- ---------------------------------------------------------------------------
CREATE TABLE user_project_access (
  user_id         UUID NOT NULL,
  project_id      UUID NOT NULL,
  organization_id UUID NOT NULL,
  granted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_project_access_pk PRIMARY KEY (user_id, project_id),
  CONSTRAINT user_project_access_user_fk FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT user_project_access_project_fk FOREIGN KEY (project_id, organization_id)
    REFERENCES projects (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX idx_user_project_access_project ON user_project_access (project_id);

CREATE TABLE user_warehouse_access (
  user_id         UUID NOT NULL,
  warehouse_id    UUID NOT NULL,
  organization_id UUID NOT NULL,
  granted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_warehouse_access_pk PRIMARY KEY (user_id, warehouse_id),
  CONSTRAINT user_warehouse_access_user_fk FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT user_warehouse_access_warehouse_fk FOREIGN KEY (warehouse_id, organization_id)
    REFERENCES warehouses (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX idx_user_warehouse_access_warehouse ON user_warehouse_access (warehouse_id);

-- ---------------------------------------------------------------------------
-- 6. Audit lookups for denied-access reports
-- ---------------------------------------------------------------------------
CREATE INDEX idx_audit_logs_event_created ON system_audit_logs (event_type, created_at);

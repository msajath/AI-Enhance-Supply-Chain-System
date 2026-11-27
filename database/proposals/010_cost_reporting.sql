-- PROPOSAL ONLY: do not apply without explicit schema approval.
-- Canonical COST_RECORD is represented by cost_records. Project budgets are an
-- explicitly proposed supporting entity for AESCS-106, not an ERD rewrite.
-- Apply transactionally after the existing foundation migrations.
CREATE TABLE cost_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL,
 cost_type text NOT NULL CHECK(cost_type IN ('PURCHASE','TRANSPORT','FUEL','MAINTENANCE','WAREHOUSE','WASTAGE','OTHER')),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 incurred_on date NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 255),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 1 AND 1000),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),
 recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(recorded_by,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(organization_id,reference)
);
CREATE INDEX cost_records_scope_date ON cost_records(organization_id,project_id,incurred_on);
CREATE TABLE project_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL,
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 amount numeric(16,2) NOT NULL CHECK(amount>=0),
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end>=period_start),
 configured_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(configured_by,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(organization_id,project_id,currency,period_start,period_end)
);
CREATE INDEX project_budgets_scope_date ON project_budgets(organization_id,project_id,period_start,period_end);
-- Rollback, only in a separately approved disposable environment: first disable
-- cost entry/reporting, then DROP TABLE project_budgets; DROP TABLE cost_records;
-- Never execute rollback against working data without explicit authorization.

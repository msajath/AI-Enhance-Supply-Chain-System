CREATE TABLE material_categories (
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  PRIMARY KEY (organization_id, name)
);
CREATE TABLE catalog_units (
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  dimension text NOT NULL,
  PRIMARY KEY (organization_id, name),
  UNIQUE (organization_id, name, dimension)
);
INSERT INTO material_categories SELECT DISTINCT organization_id, category FROM materials;
INSERT INTO catalog_units SELECT DISTINCT organization_id, unit, 'legacy:' || unit FROM materials;
ALTER TABLE materials
  ADD COLUMN specifications jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(specifications) = 'object'),
  ADD CONSTRAINT materials_catalog_category_fk FOREIGN KEY (organization_id, category) REFERENCES material_categories,
  ADD CONSTRAINT materials_catalog_unit_fk FOREIGN KEY (organization_id, unit) REFERENCES catalog_units;

CREATE TABLE material_conversions (
  organization_id uuid NOT NULL,
  material_id uuid NOT NULL,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  dimension text NOT NULL,
  factor numeric NOT NULL CHECK (factor > 0),
  CHECK (from_unit <> to_unit),
  PRIMARY KEY (material_id, from_unit, to_unit),
  FOREIGN KEY (material_id, organization_id) REFERENCES materials(id, organization_id),
  FOREIGN KEY (organization_id, from_unit, dimension) REFERENCES catalog_units(organization_id, name, dimension),
  FOREIGN KEY (organization_id, to_unit, dimension) REFERENCES catalog_units(organization_id, name, dimension)
);

ALTER TABLE sites ADD CONSTRAINT requisition_site_project_org_unique UNIQUE (id, project_id, organization_id);
CREATE TABLE requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  UNIQUE (id, organization_id),
  FOREIGN KEY (site_id, project_id, organization_id) REFERENCES sites(id, project_id, organization_id),
  FOREIGN KEY (requester_id, organization_id) REFERENCES users(id, organization_id)
);
CREATE INDEX requisition_scope ON requisitions (organization_id, project_id, site_id);
CREATE TABLE requisition_items (
  requisition_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  material_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  estimated_unit_price numeric(14,2) NOT NULL CHECK (estimated_unit_price > 0),
  PRIMARY KEY (requisition_id, material_id),
  FOREIGN KEY (requisition_id, organization_id) REFERENCES requisitions(id, organization_id),
  FOREIGN KEY (material_id, organization_id) REFERENCES materials(id, organization_id)
);

-- Each configuration change adds a version. Decisions retain the exact version used.
CREATE TABLE requisition_approval_policies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  max_amount numeric(18,2) NOT NULL CHECK (max_amount > 0),
  configured_by uuid NOT NULL,
  configured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (configured_by, organization_id) REFERENCES users(id, organization_id)
);
CREATE INDEX requisition_policy_current ON requisition_approval_policies (organization_id, id DESC);
CREATE TABLE requisition_decisions (
  requisition_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  policy_id bigint NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  reason text NOT NULL,
  actor_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (requisition_id, organization_id) REFERENCES requisitions(id, organization_id),
  FOREIGN KEY (actor_id, organization_id) REFERENCES users(id, organization_id),
  FOREIGN KEY (policy_id, organization_id) REFERENCES requisition_approval_policies(id, organization_id)
);
CREATE FUNCTION prevent_procurement_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Procurement history is append-only';
END;
$$;
CREATE TRIGGER immutable_policy BEFORE UPDATE OR DELETE ON requisition_approval_policies
FOR EACH ROW EXECUTE FUNCTION prevent_procurement_history_change();
CREATE TRIGGER immutable_decision BEFORE UPDATE OR DELETE ON requisition_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_procurement_history_change();

-- Associate a pending receipt with its supplier and original delivery commitment.
ALTER TABLE stock_documents ADD CONSTRAINT supplier_receipt_id_org_unique UNIQUE (id, organization_id);
CREATE TABLE supplier_receipt_commitments (
  receipt_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  promised_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (receipt_id, organization_id) REFERENCES stock_documents(id, organization_id),
  FOREIGN KEY (supplier_id, organization_id) REFERENCES users(id, organization_id),
  FOREIGN KEY (recorded_by, organization_id) REFERENCES users(id, organization_id)
);
CREATE INDEX supplier_receipt_supplier ON supplier_receipt_commitments (organization_id, supplier_id);
CREATE TRIGGER immutable_commitment BEFORE UPDATE OR DELETE ON supplier_receipt_commitments
FOR EACH ROW EXECUTE FUNCTION prevent_procurement_history_change();

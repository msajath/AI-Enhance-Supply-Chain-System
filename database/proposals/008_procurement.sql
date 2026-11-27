-- PROPOSAL ONLY: requires team/schema approval. Not discovered by the migration runner.
-- Physical names follow existing plural naming; organizations map to canonical COMPANY.
-- Apply in an explicit transaction on an isolated database first. No seed data is included.
BEGIN;
CREATE TABLE suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(length(trim(code))>0), name text NOT NULL CHECK(length(trim(name))>0),
 contact_person text NOT NULL, email text NOT NULL, phone text NOT NULL, address text,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','SUSPENDED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,code), UNIQUE(id,organization_id)
);
CREATE TABLE supplier_users (
 user_id uuid PRIMARY KEY REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 supplier_id uuid NOT NULL, FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id)
);
CREATE TABLE approval_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 project_id uuid NOT NULL REFERENCES projects(id), approver_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('REQUISITION','PURCHASE_ORDER')), is_active boolean NOT NULL DEFAULT true,
 UNIQUE(organization_id,project_id,kind), UNIQUE(id,organization_id)
);
CREATE TABLE purchase_requisitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, project_id uuid NOT NULL REFERENCES projects(id), requester_id uuid NOT NULL REFERENCES users(id),
 required_by_date date NOT NULL, notes text, status text NOT NULL DEFAULT 'PENDING_APPROVAL'
 CHECK(status IN ('PENDING_APPROVAL','APPROVED','REJECTED','FULFILLED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,code), UNIQUE(id,organization_id)
);
CREATE TABLE requisition_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 requisition_id uuid NOT NULL, material_id uuid NOT NULL REFERENCES materials(id), quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 FOREIGN KEY(requisition_id,organization_id) REFERENCES purchase_requisitions(id,organization_id),
 UNIQUE(requisition_id,material_id), UNIQUE(id,organization_id)
);
CREATE TABLE procurement_rfqs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 requisition_id uuid NOT NULL, due_date date NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(requisition_id,organization_id) REFERENCES purchase_requisitions(id,organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE procurement_rfq_suppliers (
 rfq_id uuid NOT NULL, supplier_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id),
 PRIMARY KEY(rfq_id,supplier_id), FOREIGN KEY(rfq_id,organization_id) REFERENCES procurement_rfqs(id,organization_id),
 FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id)
);
CREATE TABLE procurement_quotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), rfq_id uuid NOT NULL,
 supplier_id uuid NOT NULL, valid_until date NOT NULL, lead_time_days integer NOT NULL CHECK(lead_time_days>=0), delivery_terms text,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(rfq_id,supplier_id) REFERENCES procurement_rfq_suppliers(rfq_id,supplier_id),
 FOREIGN KEY(rfq_id,organization_id) REFERENCES procurement_rfqs(id,organization_id),
 FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id), UNIQUE(rfq_id,supplier_id), UNIQUE(id,organization_id)
);
CREATE TABLE procurement_quotation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), quotation_id uuid NOT NULL,
 requisition_item_id uuid NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0),
 FOREIGN KEY(quotation_id,organization_id) REFERENCES procurement_quotations(id,organization_id),
 FOREIGN KEY(requisition_item_id,organization_id) REFERENCES requisition_items(id,organization_id), UNIQUE(quotation_id,requisition_item_id)
);
CREATE TABLE procurement_purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), quotation_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES projects(id), supplier_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 reference_no text NOT NULL, total_value numeric(18,2) NOT NULL CHECK(total_value>=0),
 status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL','OPEN','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(quotation_id,organization_id) REFERENCES procurement_quotations(id,organization_id),
 FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id), UNIQUE(quotation_id), UNIQUE(organization_id,reference_no), UNIQUE(id,organization_id)
);
CREATE TABLE procurement_purchase_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), purchase_order_id uuid NOT NULL,
 requisition_item_id uuid NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0),
 FOREIGN KEY(purchase_order_id,organization_id) REFERENCES procurement_purchase_orders(id,organization_id),
 FOREIGN KEY(requisition_item_id,organization_id) REFERENCES requisition_items(id,organization_id), UNIQUE(purchase_order_id,requisition_item_id)
);
CREATE TABLE approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), policy_id uuid NOT NULL,
 requisition_id uuid, purchase_order_id uuid, approver_id uuid NOT NULL REFERENCES users(id), requester_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(approver_id<>requester_id),
 CHECK((requisition_id IS NOT NULL)::integer+(purchase_order_id IS NOT NULL)::integer=1),
 FOREIGN KEY(policy_id,organization_id) REFERENCES approval_policies(id,organization_id),
 FOREIGN KEY(requisition_id,organization_id) REFERENCES purchase_requisitions(id,organization_id),
 FOREIGN KEY(purchase_order_id,organization_id) REFERENCES procurement_purchase_orders(id,organization_id),
 UNIQUE(requisition_id), UNIQUE(purchase_order_id), UNIQUE(id,organization_id)
);
CREATE TABLE approval_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), approval_request_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')), comments text,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(decision<>'REJECTED' OR length(trim(comments))>0 AND comments IS NOT NULL),
 FOREIGN KEY(approval_request_id,organization_id) REFERENCES approval_requests(id,organization_id)
);
CREATE INDEX procurement_requisition_scope_idx ON purchase_requisitions(organization_id,project_id,created_at DESC);
CREATE INDEX procurement_approval_queue_idx ON approval_requests(organization_id,approver_id,status);
CREATE INDEX procurement_price_dates_idx ON procurement_quotations(organization_id,supplier_id,created_at);

-- Tenant-qualified references reuse existing parent UNIQUE(id,organization_id) keys.
ALTER TABLE supplier_users ADD FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE approval_policies ADD FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 ADD FOREIGN KEY(approver_id,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE purchase_requisitions ADD FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 ADD FOREIGN KEY(requester_id,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE requisition_items ADD FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id);
ALTER TABLE procurement_rfqs ADD FOREIGN KEY(created_by,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE procurement_purchase_orders ADD FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 ADD FOREIGN KEY(created_by,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE approval_requests ADD FOREIGN KEY(approver_id,organization_id) REFERENCES users(id,organization_id),
 ADD FOREIGN KEY(requester_id,organization_id) REFERENCES users(id,organization_id);
ALTER TABLE approval_actions ADD FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id);
-- One explicit assigned reviewer per project/document kind. No financial tiers or
-- invented approval thresholds: tiered multi-step approval remains a separate schema decision.
CREATE FUNCTION protect_procurement_approval_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Approval actions are append-only'; END;
$$;
CREATE TRIGGER procurement_approval_actions_immutable BEFORE UPDATE OR DELETE ON approval_actions
 FOR EACH ROW EXECUTE FUNCTION protect_procurement_approval_action();
COMMIT;

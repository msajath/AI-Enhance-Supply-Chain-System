-- PROPOSAL ONLY: apply only after explicit approval, following reviewed proposal 008.
-- Extends canonical transport/delivery/POD/site-receipt entities with tenant keys,
-- request item lines (needed for split deliveries) and append-only state events.
-- No existing records are rewritten. No physical file-storage system is introduced.
ALTER TABLE vehicle_assignments ADD CONSTRAINT vehicle_assignments_id_org_unique UNIQUE(id,organization_id);
CREATE TABLE transport_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 project_id uuid NOT NULL, warehouse_id uuid NOT NULL, destination_site_id uuid NOT NULL,
 requested_by uuid NOT NULL, purchase_order_id uuid, stock_document_id uuid,
 needed_at timestamptz NOT NULL, notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','PLANNED','DISPATCHED','COMPLETED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id),
 CHECK (purchase_order_id IS NULL OR stock_document_id IS NULL),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 FOREIGN KEY(warehouse_id,organization_id) REFERENCES warehouses(id,organization_id),
 FOREIGN KEY(destination_site_id,organization_id) REFERENCES sites(id,organization_id),
 FOREIGN KEY(requested_by,organization_id) REFERENCES users(id,organization_id),
 FOREIGN KEY(purchase_order_id,organization_id) REFERENCES procurement_purchase_orders(id,organization_id),
 FOREIGN KEY(stock_document_id) REFERENCES stock_documents(id)
);
CREATE TABLE transport_request_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 transport_request_id uuid NOT NULL, material_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), UNIQUE(transport_request_id,material_id),
 UNIQUE(id,organization_id),
 FOREIGN KEY(transport_request_id,organization_id) REFERENCES transport_requests(id,organization_id),
 FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id)
);
CREATE TABLE deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 transport_request_id uuid NOT NULL, assignment_id uuid NOT NULL UNIQUE,
 destination_site_id uuid NOT NULL, eta timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED','COMPLETED','FAILED','CANCELLED')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 dispatch_at timestamptz, arrived_at timestamptz, UNIQUE(id,organization_id),
 FOREIGN KEY(transport_request_id,organization_id) REFERENCES transport_requests(id,organization_id),
 FOREIGN KEY(assignment_id,organization_id) REFERENCES vehicle_assignments(id,organization_id),
 FOREIGN KEY(destination_site_id,organization_id) REFERENCES sites(id,organization_id),
 FOREIGN KEY(created_by,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE delivery_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 delivery_id uuid NOT NULL, material_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), UNIQUE(delivery_id,material_id), UNIQUE(id,organization_id),
 FOREIGN KEY(delivery_id,organization_id) REFERENCES deliveries(id,organization_id),
 FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id)
);
CREATE TABLE delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, delivery_id uuid NOT NULL,
 actor_id uuid NOT NULL, previous_status text, status text NOT NULL, notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(delivery_id,organization_id) REFERENCES deliveries(id,organization_id),
 FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE proofs_of_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, delivery_id uuid NOT NULL UNIQUE,
 submitted_by uuid NOT NULL, receiver_name text NOT NULL CHECK(length(trim(receiver_name))>0),
 received_at timestamptz NOT NULL, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(delivery_id,organization_id) REFERENCES deliveries(id,organization_id),
 FOREIGN KEY(submitted_by,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE site_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, delivery_id uuid NOT NULL UNIQUE,
 received_by uuid NOT NULL, notes text NOT NULL DEFAULT '', received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),
 FOREIGN KEY(delivery_id,organization_id) REFERENCES deliveries(id,organization_id),
 FOREIGN KEY(received_by,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE site_receipt_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, site_receipt_id uuid NOT NULL,
 delivery_item_id uuid NOT NULL UNIQUE, accepted_quantity numeric(14,3) NOT NULL CHECK(accepted_quantity>=0),
 rejected_quantity numeric(14,3) NOT NULL CHECK(rejected_quantity>=0), short_quantity numeric(14,3) NOT NULL CHECK(short_quantity>=0),
 reason text NOT NULL DEFAULT '',
 FOREIGN KEY(site_receipt_id,organization_id) REFERENCES site_receipts(id,organization_id),
 FOREIGN KEY(delivery_item_id,organization_id) REFERENCES delivery_items(id,organization_id)
);
CREATE INDEX transport_requests_scope_idx ON transport_requests(organization_id,project_id,destination_site_id,created_at DESC);
CREATE INDEX deliveries_scope_idx ON deliveries(organization_id,destination_site_id,status);
CREATE INDEX delivery_events_history_idx ON delivery_events(delivery_id,created_at);
CREATE FUNCTION enforce_site_receipt_quantities() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dispatched numeric;
BEGIN
 SELECT i.quantity INTO dispatched FROM delivery_items i
 JOIN site_receipts r ON r.id=NEW.site_receipt_id AND r.organization_id=NEW.organization_id
 WHERE i.id=NEW.delivery_item_id AND i.organization_id=NEW.organization_id AND i.delivery_id=r.delivery_id;
 IF dispatched IS NULL OR NEW.accepted_quantity+NEW.rejected_quantity+NEW.short_quantity<>dispatched THEN
  RAISE EXCEPTION 'Receipt quantities must reconcile with the dispatched delivery item' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER site_receipt_quantity_check BEFORE INSERT ON site_receipt_items FOR EACH ROW EXECUTE FUNCTION enforce_site_receipt_quantities();
CREATE FUNCTION immutable_delivery_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Delivery evidence is append-only'; END $$;
CREATE TRIGGER delivery_events_immutable BEFORE UPDATE OR DELETE ON delivery_events FOR EACH ROW EXECUTE FUNCTION immutable_delivery_evidence();
CREATE TRIGGER delivery_proof_immutable BEFORE UPDATE OR DELETE ON proofs_of_delivery FOR EACH ROW EXECUTE FUNCTION immutable_delivery_evidence();
CREATE TRIGGER site_receipts_immutable BEFORE UPDATE OR DELETE ON site_receipts FOR EACH ROW EXECUTE FUNCTION immutable_delivery_evidence();
CREATE TRIGGER site_receipt_items_immutable BEFORE UPDATE OR DELETE ON site_receipt_items FOR EACH ROW EXECUTE FUNCTION immutable_delivery_evidence();
-- Rollback requires separate approval: no automatic DROP or deletion is provided.

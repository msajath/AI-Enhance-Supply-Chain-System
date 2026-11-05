-- Incremental three-role operational schema. Existing master data is preserved.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','FLEET_MANAGER','WAREHOUSE_MANAGER','DRIVER'));
-- Legacy driver accounts are retained for history, but cannot sign in to the three-role portal.
UPDATE users SET is_active=false WHERE role='DRIVER';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'WAREHOUSE_MANAGER';
ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE user_site_access (
 user_id uuid NOT NULL, site_id uuid NOT NULL, organization_id uuid NOT NULL,
 PRIMARY KEY(user_id,site_id),
 FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id),
 FOREIGN KEY(site_id,organization_id) REFERENCES sites(id,organization_id)
);
ALTER TABLE fleet_vehicles ADD COLUMN project_id uuid, ADD COLUMN site_id uuid,
 ADD COLUMN vehicle_type text NOT NULL DEFAULT 'TRUCK', ADD COLUMN capacity_unit text NOT NULL DEFAULT 'tons',
 ADD COLUMN ownership text NOT NULL DEFAULT 'OWNED' CHECK(ownership IN ('OWNED','LEASED')),
 ADD COLUMN asset_kind text NOT NULL DEFAULT 'VEHICLE' CHECK(asset_kind IN ('VEHICLE','EQUIPMENT')),
 ADD COLUMN odometer numeric(14,2) NOT NULL DEFAULT 0 CHECK(odometer>=0),
 ADD CONSTRAINT fleet_id_org_unique UNIQUE(id,organization_id),
 ADD CONSTRAINT fleet_project_fk FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 ADD CONSTRAINT fleet_site_fk FOREIGN KEY(site_id,organization_id) REFERENCES sites(id,organization_id),
 ADD CONSTRAINT fleet_capacity_valid CHECK(capacity_tons>=0),
 ADD CONSTRAINT fleet_status_valid CHECK(status IN ('AVAILABLE','ASSIGNED','MAINTENANCE','INACTIVE'));
CREATE TABLE fleet_drivers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 project_id uuid NOT NULL, name text NOT NULL, phone text NOT NULL, license_number text NOT NULL,
 license_expiry date NOT NULL, status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','UNAVAILABLE','INACTIVE')),
 UNIQUE(organization_id,license_number), UNIQUE(id,organization_id),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id)
);
CREATE TABLE vehicle_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 project_id uuid NOT NULL, site_id uuid, vehicle_id uuid NOT NULL, driver_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, load_quantity numeric(14,3) NOT NULL CHECK(load_quantity>=0),
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 FOREIGN KEY(site_id,organization_id) REFERENCES sites(id,organization_id),
 FOREIGN KEY(vehicle_id,organization_id) REFERENCES fleet_vehicles(id,organization_id),
 FOREIGN KEY(driver_id,organization_id) REFERENCES fleet_drivers(id,organization_id)
);
CREATE INDEX assignments_vehicle_time ON vehicle_assignments(vehicle_id,starts_at,ends_at) WHERE status='SCHEDULED';
CREATE INDEX assignments_driver_time ON vehicle_assignments(driver_id,starts_at,ends_at) WHERE status='SCHEDULED';
CREATE TABLE maintenance_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 vehicle_id uuid NOT NULL, description text NOT NULL, scheduled_date date NOT NULL,
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
 cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(cost>=0), next_service_date date, next_service_mileage numeric(14,2) CHECK(next_service_mileage>=0),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(vehicle_id,organization_id) REFERENCES fleet_vehicles(id,organization_id)
);
CREATE TABLE fuel_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 vehicle_id uuid NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit text NOT NULL DEFAULT 'litres' CHECK(unit='litres'),
 unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0), total_cost numeric(16,2) GENERATED ALWAYS AS (quantity*unit_price) STORED,
 odometer numeric(14,2) NOT NULL CHECK(odometer>=0), recorded_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(vehicle_id,organization_id) REFERENCES fleet_vehicles(id,organization_id)
);
CREATE TABLE materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, name text NOT NULL, unit text NOT NULL, category text NOT NULL DEFAULT 'General', reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
 UNIQUE(organization_id,code), UNIQUE(id,organization_id)
);
CREATE TABLE stock_balances (
 organization_id uuid NOT NULL, warehouse_id uuid NOT NULL, material_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity>=0), reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity),
 quarantined numeric(14,3) NOT NULL DEFAULT 0 CHECK(quarantined>=0),
 PRIMARY KEY(warehouse_id,material_id),
 FOREIGN KEY(warehouse_id,organization_id) REFERENCES warehouses(id,organization_id),
 FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id)
);
CREATE TABLE stock_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 kind text NOT NULL CHECK(kind IN ('RECEIPT','ISSUE','TRANSFER','ADJUSTMENT','COUNT','RETURN')),
 warehouse_id uuid NOT NULL, destination_id uuid, project_id uuid, site_id uuid, material_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>=0), rejected_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0),
 reason text NOT NULL, reference text NOT NULL, batch text, condition text NOT NULL DEFAULT 'USABLE' CHECK(condition IN ('USABLE','QUARANTINED','DAMAGED')),
 status text NOT NULL CHECK(status IN ('PENDING','POSTED','IN_TRANSIT','RECEIVED','CANCELLED')),
 expected_quantity numeric(14,3), before_quantity numeric(14,3), after_quantity numeric(14,3),
 created_by uuid NOT NULL REFERENCES users(id), processed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 FOREIGN KEY(warehouse_id,organization_id) REFERENCES warehouses(id,organization_id),
 FOREIGN KEY(destination_id,organization_id) REFERENCES warehouses(id,organization_id),
 FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id),
 FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id),
 FOREIGN KEY(site_id,organization_id) REFERENCES sites(id,organization_id),
 UNIQUE(organization_id,kind,reference), CHECK(destination_id IS NULL OR destination_id<>warehouse_id)
);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, warehouse_id uuid NOT NULL, material_id uuid NOT NULL,
 document_id uuid NOT NULL REFERENCES stock_documents(id), quantity_change numeric(14,3) NOT NULL,
 quarantine_change numeric(14,3) NOT NULL DEFAULT 0, before_quantity numeric(14,3) NOT NULL, after_quantity numeric(14,3) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(warehouse_id,organization_id) REFERENCES warehouses(id,organization_id), FOREIGN KEY(material_id,organization_id) REFERENCES materials(id,organization_id)
);
CREATE INDEX stock_docs_scope ON stock_documents(organization_id,warehouse_id,kind,created_at DESC);
CREATE INDEX stock_moves_scope ON stock_movements(warehouse_id,material_id,created_at DESC);
CREATE OR REPLACE FUNCTION immutable_stock_movement() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Stock movements are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION immutable_stock_movement();

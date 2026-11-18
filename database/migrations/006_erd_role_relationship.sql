-- ERD p2/p3: ROLE.company_id -> COMPANY; APP_USER.role_id -> ROLE.
-- Physical naming follows existing organizations/users conventions.
-- users.role remains a synchronized compatibility code, not another assignment.
CREATE TABLE roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 role_name varchar(50) NOT NULL CHECK (length(trim(role_name)) > 0),
 description text NOT NULL DEFAULT '',
 UNIQUE (organization_id,role_name),
 UNIQUE (id,organization_id)
);

CREATE FUNCTION seed_organization_roles(target_organization uuid) RETURNS void AS $$
BEGIN
 INSERT INTO roles(organization_id,role_name,description)
 SELECT target_organization,v.code,v.label FROM (VALUES
 ('ADMIN','System administrator'),
 ('SUPPLY_CHAIN_MANAGER','Supply chain / executive manager'),
 ('PROCUREMENT_OFFICER','Procurement officer'),
 ('WAREHOUSE_MANAGER','Warehouse manager'),
 ('FLEET_MANAGER','Fleet / maintenance manager'),
 ('LOGISTICS_COORDINATOR','Logistics coordinator'),
 ('PROJECT_MANAGER','Project manager / site engineer'),
 ('SITE_STOREKEEPER','Site storekeeper'),
 ('FINANCE_OFFICER','Finance / cost control officer'),
 ('DRIVER_OPERATOR','Driver / operator'),
 ('SUPPLIER_USER','Supplier portal user'),
 ('AUDITOR','Read-only auditor'),
 ('DRIVER','Legacy inactive driver identifier; retained for historical accounts')
 ) AS v(code,label)
 ON CONFLICT (organization_id,role_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

SELECT seed_organization_roles(id) FROM organizations;

CREATE FUNCTION seed_new_organization_roles() RETURNS trigger AS $$
BEGIN
 PERFORM seed_organization_roles(NEW.id);
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organizations_seed_roles AFTER INSERT ON organizations
 FOR EACH ROW EXECUTE FUNCTION seed_new_organization_roles();

ALTER TABLE users ADD COLUMN role_id uuid;
UPDATE users u SET role_id=r.id FROM roles r
 WHERE r.organization_id=u.organization_id AND r.role_name=u.role;

ALTER TABLE users ADD CONSTRAINT users_role_organization_fk
 FOREIGN KEY(role_id,organization_id) REFERENCES roles(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE users ADD CONSTRAINT users_role_code_organization_fk
 FOREIGN KEY(organization_id,role) REFERENCES roles(organization_id,role_name) ON DELETE RESTRICT;
ALTER TABLE users ADD CONSTRAINT users_role_assignment_required CHECK (
 (organization_id IS NULL AND role_id IS NULL) OR
 (organization_id IS NOT NULL AND role_id IS NOT NULL)
);
CREATE INDEX users_role_id_idx ON users(role_id);

CREATE FUNCTION synchronize_user_role() RETURNS trigger AS $$
DECLARE resolved_id uuid; resolved_code varchar(50);
BEGIN
 -- Retain historical organization-less accounts; requireAuth denies their scope.
 IF NEW.organization_id IS NULL THEN
  IF NEW.role_id IS NOT NULL THEN
   RAISE EXCEPTION 'Role assignment requires an organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.role_id IS NOT NULL AND
    (TG_OP='INSERT' OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
  SELECT id,role_name INTO resolved_id,resolved_code FROM roles
   WHERE id=NEW.role_id AND organization_id=NEW.organization_id;
  IF resolved_id IS NULL THEN
   RAISE EXCEPTION 'Role must belong to the user organization' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.role<>resolved_code THEN
   RAISE EXCEPTION 'Conflicting role code and identifier' USING ERRCODE='23514';
  END IF;
  NEW.role=resolved_code;
 ELSE
  SELECT id INTO resolved_id FROM roles
   WHERE organization_id=NEW.organization_id AND role_name=NEW.role;
  IF resolved_id IS NULL THEN
   RAISE EXCEPTION 'Unknown organization role' USING ERRCODE='23514';
  END IF;
  NEW.role_id=resolved_id;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER users_synchronize_role BEFORE INSERT OR UPDATE OF role,role_id,organization_id ON users
 FOR EACH ROW EXECUTE FUNCTION synchronize_user_role();

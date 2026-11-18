-- Run after migrations 001-006, against a disposable PostgreSQL database only.
BEGIN;
SET LOCAL plpgsql.check_asserts=on;
DO $$
DECLARE org_a uuid; org_b uuid; admin_role uuid; auditor_role uuid; foreign_role uuid;
        member uuid; effective_code text; effective_id uuid; total integer;
BEGIN
 INSERT INTO organizations(name,code) VALUES('Role migration test A','ROLE-TEST-A') RETURNING id INTO org_a;
 INSERT INTO organizations(name,code) VALUES('Role migration test B','ROLE-TEST-B') RETURNING id INTO org_b;
 SELECT count(*) INTO total FROM roles WHERE organization_id=org_a;
 ASSERT total=13, '12 supported roles plus retained legacy DRIVER must be seeded';
 PERFORM seed_organization_roles(org_a);
 SELECT count(*) INTO total FROM roles WHERE organization_id=org_a;
 ASSERT total=13, 'Repeated seeding must not duplicate roles';
 SELECT id INTO admin_role FROM roles WHERE organization_id=org_a AND role_name='ADMIN';
 SELECT id INTO auditor_role FROM roles WHERE organization_id=org_a AND role_name='AUDITOR';
 SELECT id INTO foreign_role FROM roles WHERE organization_id=org_b AND role_name='ADMIN';

 INSERT INTO users(organization_id,email,full_name,password_hash,role)
 VALUES(org_a,'role-test-a@example.test','Role test A','synthetic-test-hash','ADMIN') RETURNING id,role_id INTO member,effective_id;
 ASSERT effective_id=admin_role, 'Legacy role-code inserts must resolve the normalized role';
 UPDATE users SET role='AUDITOR' WHERE id=member;
 SELECT role_id INTO effective_id FROM users WHERE id=member;
 ASSERT effective_id=auditor_role, 'Legacy role-code updates must synchronize role_id';
 UPDATE users SET role_id=admin_role WHERE id=member;
 SELECT role INTO effective_code FROM users WHERE id=member;
 ASSERT effective_code='ADMIN', 'Normalized role updates must synchronize the compatibility code';

 BEGIN
  UPDATE users SET role_id=foreign_role WHERE id=member;
  RAISE EXCEPTION 'Cross-organization role was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE users SET role_id=auditor_role,role='FLEET_MANAGER' WHERE id=member;
  RAISE EXCEPTION 'Conflicting role identifiers were accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO roles(organization_id,role_name) VALUES(org_a,'ADMIN');
  RAISE EXCEPTION 'Duplicate role was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  DELETE FROM roles WHERE id=admin_role;
  RAISE EXCEPTION 'Assigned role deletion was accepted';
 EXCEPTION WHEN integrity_constraint_violation THEN NULL;
 END;
 BEGIN
  UPDATE roles SET role_name='RENAMED_ADMIN' WHERE id=admin_role;
  RAISE EXCEPTION 'Assigned role rename was accepted';
 EXCEPTION WHEN integrity_constraint_violation THEN NULL;
 END;
 INSERT INTO users(organization_id,email,full_name,password_hash,role_id)
 VALUES(org_a,'role-test-b@example.test','Role test B','synthetic-test-hash',auditor_role)
 RETURNING role INTO effective_code;
 ASSERT effective_code='AUDITOR', 'role_id-only insertion must resolve its role code';
 INSERT INTO users(organization_id,email,full_name,password_hash,role,is_active)
 VALUES(org_a,'role-test-legacy@example.test','Legacy test','synthetic-test-hash','DRIVER',false);
 ASSERT NOT (SELECT is_active FROM users WHERE email='role-test-legacy@example.test'), 'Legacy accounts must remain inactive';
END;
$$;
ROLLBACK;

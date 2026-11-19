-- Extend the existing single-role model without adding ERD relationships.
-- No users, passwords, scopes or activation states are rewritten.
-- DRIVER is a retained legacy identifier; disabled legacy accounts stay disabled.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
 'ADMIN','FLEET_MANAGER','WAREHOUSE_MANAGER','SUPPLY_CHAIN_MANAGER',
 'PROCUREMENT_OFFICER','LOGISTICS_COORDINATOR','PROJECT_MANAGER',
 'SITE_STOREKEEPER','FINANCE_OFFICER','DRIVER_OPERATOR','SUPPLIER_USER','AUDITOR','DRIVER'
));
-- Login is case-insensitive; enforce the same identity rule for provisioning.
-- Existing case-colliding emails cause a transactional failure, never data deletion.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(lower(email));

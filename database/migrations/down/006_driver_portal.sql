-- ROLLBACK for 006_driver_portal.sql (npm run db:rollback)
-- Driver requests are removed first so the old role rule can be restored.
DROP INDEX IF EXISTS fleet_drivers_user_unique;
ALTER TABLE fleet_drivers DROP COLUMN IF EXISTS user_id;
DELETE FROM access_requests WHERE requested_role = 'DRIVER';
ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_role_valid;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_role_valid
    CHECK (requested_role IN ('WAREHOUSE_MANAGER', 'FLEET_MANAGER'));

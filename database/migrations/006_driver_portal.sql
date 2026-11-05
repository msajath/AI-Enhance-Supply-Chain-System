-- ==============================================================================
-- 006: Driver portal
-- * Drivers can ask for an account from the sign-in page (access_requests).
-- * A fleet driver record can be linked to the driver's login account, so the
--   driver sees only their own assignments.
-- Rollback: database/migrations/down/006_driver_portal.sql
-- ==============================================================================

ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_role_valid;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_role_valid
    CHECK (requested_role IN ('WAREHOUSE_MANAGER', 'FLEET_MANAGER', 'DRIVER'));

ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
-- One login account belongs to at most one driver record.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_user_unique ON fleet_drivers (user_id) WHERE user_id IS NOT NULL;

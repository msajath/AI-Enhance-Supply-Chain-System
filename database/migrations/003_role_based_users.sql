-- ==============================================================================
-- QORVENZ TECH — 003 ROLE-BASED USERS
-- Restricts users.role to the three supported platform roles used by
-- role-based sign up / sign in: ADMIN, WAREHOUSE_MANAGER, DRIVER.
-- ==============================================================================

-- Any legacy role values (e.g. the old 'VIEWER' default) become DRIVER, the least-privileged role.
UPDATE users
SET role = 'DRIVER', updated_at = CURRENT_TIMESTAMP
WHERE role NOT IN ('ADMIN', 'WAREHOUSE_MANAGER', 'DRIVER');

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'DRIVER';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'WAREHOUSE_MANAGER', 'DRIVER'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

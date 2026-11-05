-- ==============================================================================
-- 005: Access requests (public "Request an account" form)
-- A request never grants access by itself. An administrator of the chosen
-- company approves it (which creates the user account) or rejects it.
-- The password is stored only as a bcrypt hash and moves to the new user on approval.
-- Rollback: database/migrations/down/005_access_requests.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    requested_role VARCHAR(30) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT access_requests_role_valid CHECK (requested_role IN ('WAREHOUSE_MANAGER', 'FLEET_MANAGER')),
    CONSTRAINT access_requests_status_valid CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT access_requests_email_lower CHECK (email = lower(email)),
    CONSTRAINT access_requests_reviewed CHECK ((status = 'PENDING') = (reviewed_at IS NULL))
);

-- Only one open request per email and company.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
    ON access_requests (organization_id, email) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_access_requests_org_status
    ON access_requests (organization_id, status, created_at DESC);

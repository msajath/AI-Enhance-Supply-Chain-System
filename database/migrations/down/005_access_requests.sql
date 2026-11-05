-- ROLLBACK for 005_access_requests.sql (npm run db:rollback)
-- WARNING: deletes all pending and reviewed access requests.
DROP INDEX IF EXISTS idx_access_requests_org_status;
DROP INDEX IF EXISTS access_requests_one_pending;
DROP TABLE IF EXISTS access_requests;

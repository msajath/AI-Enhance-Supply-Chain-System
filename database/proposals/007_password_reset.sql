-- PENDING APPROVAL. Outside migration discovery intentionally. Do not apply without approval.
CREATE TABLE password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest CHAR(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_user_created_idx ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX password_reset_expiry_idx ON password_reset_tokens(expires_at);

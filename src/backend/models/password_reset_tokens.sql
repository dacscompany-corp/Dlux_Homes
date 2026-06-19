-- Single-use, expiring password reset tokens for guest (users) and staff
-- (employees) accounts. Only a SHA-256 hash of the token is stored, never the
-- raw token — so a DB leak can't be used to reset anyone's password. A token is
-- consumed (used_at set) the moment it succeeds, making it strictly single-use.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);

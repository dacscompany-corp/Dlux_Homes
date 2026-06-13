-- ─────────────────────────────────────────────────────────────────────────────
-- D'Lux Homes — base tables
--
-- These tables had NO version-controlled CREATE TABLE in the original Staycation
-- project (they were created directly in the live Neon database). They are
-- RECONSTRUCTED here from how the controllers read/write them, so review the
-- column types before relying on them in production.
--
-- Everything else (booking, havens, employees, booking_payments, cleaning_*,
-- partners_*, discounts, reviews, notifications, …) DOES have CREATE TABLE
-- statements in src/backend/models and src/backend/migrations and is applied by
-- scripts/db-setup.mjs after this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- Guest / customer accounts. Credentials login, Google and Facebook OAuth all
-- land here. Staff live in `employees`; partners in `partners_account`.
-- user_id is UUID because other tables FK to it as UUID
-- (wishlist.user_id, discount_users.user_id, booking.user_id).
CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password      TEXT,                      -- null for OAuth-only accounts
  name          VARCHAR(255),
  picture       TEXT,
  user_role     VARCHAR(50) DEFAULT 'Guest',
  register_as   VARCHAR(50),               -- 'google' | 'facebook' | 'credentials'
  google_id     VARCHAR(255) UNIQUE,
  facebook_id   VARCHAR(255) UNIQUE,
  status        VARCHAR(50) DEFAULT 'active',
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id   ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users (facebook_id);

-- Per-staff activity log keyed by employment id (distinct from the system-wide
-- `employee_activity_logs` table, which has its own CREATE in the migrations).
CREATE TABLE IF NOT EXISTS staff_activity_logs (
  id             SERIAL PRIMARY KEY,
  employment_id  VARCHAR(100),
  action_type    VARCHAR(100) NOT NULL,
  action         TEXT,
  details        TEXT,
  ip_address     VARCHAR(100),
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_logs_employment ON staff_activity_logs (employment_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_logs_created_at ON staff_activity_logs (created_at);

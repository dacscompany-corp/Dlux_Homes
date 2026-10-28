-- Migration: 2026-10-26-cleaning-accept
-- Cleaners Accept or Reject a room assigned to them (owner, 2026-10-26).
-- accepted_at is set when they accept; cleared whenever the room changes
-- hands (reassigned or rejected), so the next cleaner accepts it themselves.
-- Rejecting uses the declined_by / declined_at columns (2026-10-26-cleaning-decline).
-- Idempotent.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Migration: 2026-10-23-cleaning-reminders
-- Cleaning notifications (owner, 2026-10-23): cleaner AND Owner/CSR are told
--   - when a room is coming up (within 24h of the guest's checkout), and
--   - when it can be cleaned now (guest checked out / checkout time passed).
-- These columns record that each reminder went out, so the 15-minute sweep
-- (/api/cron/assign-cleaning) sends it exactly once. Idempotent.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS reminder_upcoming_sent_at TIMESTAMPTZ;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS reminder_start_sent_at TIMESTAMPTZ;

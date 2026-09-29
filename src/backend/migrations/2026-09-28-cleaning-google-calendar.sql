-- Cleaner Google Calendar sync.
--
-- Each cleaner gets their own "D'Lux Cleaning – Name" Google calendar, created
-- and owned by the existing Calendar service account and shared (read-only) to
-- the cleaner's login email. Every cleaning task assigned to them appears there
-- as one event: checkout → next guest's check-in, status in the title.
--
-- Safe to re-run (IF NOT EXISTS throughout). Sorts after
-- 2026-09-28-cleaning-fair-assignment.sql, which it doesn't depend on anyway.

-- ── employees: the cleaner's calendar ───────────────────────────────────────
-- The Google calendar id (…@group.calendar.google.com) created for this
-- cleaner. NULL until their first assignment is synced.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cleaning_calendar_id TEXT;
-- The email the calendar was last shared to. If the cleaner's email changes,
-- the next sync notices the difference and shares it to the new address.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cleaning_calendar_shared_to TEXT;

-- ── booking_cleaning: where this task's event lives ─────────────────────────
-- The event and the calendar it's in are stored together: on a reassignment the
-- old event must be deleted from the OLD cleaner's calendar, which is only
-- findable if we remember which calendar that was.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT;
-- Last successful sync, and the last error if the most recent attempt failed —
-- so a silent Google outage is visible in the data instead of guessed at.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS gcal_synced_at TIMESTAMPTZ;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS gcal_error TEXT;

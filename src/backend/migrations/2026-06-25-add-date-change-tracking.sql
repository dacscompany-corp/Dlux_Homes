-- D'Lux policy: NO cancellations, but a guest may request a ONE-TIME date change
-- (>= 7 days before check-in, new date within 1 month of the original).
--
-- These columns let /api/bookings/[id]/request-date-change enforce the
-- "one-time" rule and give staff an audit trail of what was requested.
--   date_change_count        — number of date-change requests used (cap 1)
--   date_change_requested_at — when the (most recent) request was made
--   requested_new_date       — the date the guest asked to move to
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS date_change_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_change_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_new_date DATE;

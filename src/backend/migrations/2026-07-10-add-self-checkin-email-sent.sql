-- Pre-arrival "self check-in" email (key location + house rules).
-- Distinct from the check-in module (/api/send-checkin-email), which fires
-- after an admin marks a booking "Checked In".
--
-- The scheduler (/api/cron/send-self-checkin-emails) runs on a short interval,
-- so it needs a durable record of which bookings have already been emailed —
-- without it, every run would re-send to the same guests. Stamped only AFTER a
-- successful send, so a transient SMTP failure simply retries on the next run.
--
-- Send time (Asia/Manila), derived from check_in_time:
--   Daycation      (check-in before noon) → 12:00 AM on the check-in date
--   Nightcation /
--   Overnight      (evening check-in)     → 2 hours before check-in

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS self_checkin_email_sent_at TIMESTAMPTZ;

-- Partial index: the cron only ever scans bookings that haven't been sent yet.
CREATE INDEX IF NOT EXISTS idx_booking_self_checkin_pending
  ON booking (check_in_date)
  WHERE self_checkin_email_sent_at IS NULL;

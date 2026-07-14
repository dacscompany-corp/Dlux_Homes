-- Check-out reminder email, sent 2 hours before check-out (instructions +
-- security-deposit refund request).
-- Distinct from the check-out module (/api/send-checkout-email), which fires
-- after an admin marks a booking "Checked Out".
--
-- The scheduler (/api/cron/send-checkout-reminders) runs on a short interval,
-- so it needs a durable record of which bookings have already been reminded —
-- without it, every run would re-send to the same guests. Stamped only AFTER a
-- successful send, so a transient SMTP failure simply retries on the next run.
--
-- Send time (Asia/Manila): (check_out_date + check_out_time) - 2 hours.
-- Applies to every stay type, so no branching is needed here (unlike the
-- self check-in email, where Daycation sends at midnight instead).

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS checkout_reminder_email_sent_at TIMESTAMPTZ;

-- Partial index: the cron only ever scans bookings that haven't been sent yet.
CREATE INDEX IF NOT EXISTS idx_booking_checkout_reminder_pending
  ON booking (check_out_date)
  WHERE checkout_reminder_email_sent_at IS NULL;
